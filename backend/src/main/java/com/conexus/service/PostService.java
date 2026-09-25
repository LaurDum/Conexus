package com.conexus.service;

import com.conexus.model.Comment;
import com.conexus.model.Post;
import com.conexus.model.Notification;
import com.conexus.model.PostLike;
import com.conexus.model.ProfileInfo;
import com.conexus.model.User;
import com.conexus.repository.CommentLikeRepository;
import com.conexus.repository.CommentRepository;
import com.conexus.repository.PostLikeRepository;
import com.conexus.repository.PostRepository;
import com.conexus.repository.ProfileInfoRepository;
import com.conexus.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class PostService {

    private final PostRepository postRepository;
    private final PostLikeRepository postLikeRepository;
    private final CommentRepository commentRepository;
    private final CommentLikeRepository commentLikeRepository;
    private final UserRepository userRepository;
    private final ProfileInfoRepository profileInfoRepository;
    private final NotificationService notificationService;

    /**
     * Newest first, with each post's `liked` flag resolved for this viewer.
     * Pass a null userId for an anonymous read — nothing shows as liked.
     */
    public List<Post> getAll(Long userId) {
        List<Post> posts = postRepository.findAllByOrderByCreatedAtDesc();

        Set<Long> likedIds = userId == null
                ? new HashSet<>()
                : new HashSet<>(postLikeRepository.findPostIdsLikedBy(userId));

        posts.forEach(post -> post.setLiked(likedIds.contains(post.getId())));
        return posts;
    }

    /**
     * Publishes a post as this user. The byline and avatar come from the
     * account, so a request cannot post under someone else's name.
     */
    @Transactional
    public Post create(Long userId, String content, String niche) {
        User author = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("Sign in to continue"));

        String name = profileInfoRepository.findByUserId(userId)
                .map(ProfileInfo::getDisplayName)
                .filter(n -> n != null && !n.isBlank())
                .orElseGet(() -> author.getDisplayName() != null ? author.getDisplayName() : author.getUsername());

        Post saved = postRepository.save(Post.builder()
                .authorId(userId)
                .authorName(name)
                .niche(niche != null && !niche.isBlank() ? niche : author.getNiche())
                .content(content.trim())
                .avatarClass(author.getBgClass() != null ? author.getBgClass() : "avatar-purple")
                .build());
        saved.setLiked(false);
        return saved;
    }

    /**
     * Toggles this user's like and recomputes the post's like count from the
     * actual rows, so the number always matches who really liked it.
     */
    @Transactional
    public Post toggleLike(Long postId, Long userId) {
        Post post = postRepository.findById(postId)
                .orElseThrow(() -> new RuntimeException("Post not found: " + postId));

        boolean nowLiked = postLikeRepository.findByPostIdAndUserId(postId, userId)
                .map(existing -> {
                    postLikeRepository.delete(existing);
                    return false;
                })
                .orElseGet(() -> {
                    postLikeRepository.save(PostLike.builder().postId(postId).userId(userId).build());
                    return true;
                });

        postLikeRepository.flush();
        post.setLikesCount((int) postLikeRepository.countByPostId(postId));
        Post saved = postRepository.save(post);
        saved.setLiked(nowLiked);

        // Only on liking; unliking should not announce itself.
        if (nowLiked) {
            notificationService.notify(post.getAuthorId(), userId, NotificationService.POST_LIKE,
                    Notification.builder()
                            .postId(post.getId())
                            .excerpt(NotificationService.excerpt(post.getContent())));
        }

        return saved;
    }

    /** True only when this post exists and was written by the given user. */
    public boolean isAuthoredBy(Long postId, Long userId) {
        return postRepository.findById(postId)
                .map(post -> userId != null && userId.equals(post.getAuthorId()))
                .orElse(false);
    }

    /** Removes a post along with its comments and likes, which would otherwise be orphaned. */
    @Transactional
    public void delete(Long id) {
        for (Comment comment : commentRepository.findByPostIdOrderByCreatedAtAsc(id)) {
            commentLikeRepository.deleteByCommentId(comment.getId());
            commentRepository.delete(comment);
        }
        postLikeRepository.deleteByPostId(id);
        postRepository.deleteById(id);
    }
}
