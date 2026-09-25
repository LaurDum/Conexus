package com.conexus.controller;

import com.conexus.model.Comment;
import com.conexus.model.Notification;
import com.conexus.model.CommentLike;
import com.conexus.model.Post;
import com.conexus.model.User;
import com.conexus.repository.CommentLikeRepository;
import com.conexus.repository.CommentRepository;
import com.conexus.repository.PostRepository;
import com.conexus.repository.ProfileInfoRepository;
import com.conexus.repository.UserRepository;
import com.conexus.security.CurrentUser;
import com.conexus.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@RestController
@RequestMapping("/api/comments")
@RequiredArgsConstructor
public class CommentController {

    private final CommentRepository commentRepository;
    private final CommentLikeRepository commentLikeRepository;
    private final PostRepository postRepository;
    private final UserRepository userRepository;
    private final ProfileInfoRepository profileInfoRepository;
    private final NotificationService notificationService;

    /**
     * GET /api/comments?postId=1
     *
     * Returns the whole thread flat, oldest first, each carrying its parentId
     * and its like state for the caller. The client nests them; keeping the
     * wire format flat means one query rather than one per reply.
     */
    @GetMapping
    public List<Comment> getComments(@CurrentUser Long userId, @RequestParam Long postId) {
        List<Comment> comments = commentRepository.findByPostIdOrderByCreatedAtAsc(postId);
        decorate(comments, userId);
        return comments;
    }

    /** Fills in the like count and the caller's own like for each comment. */
    private void decorate(List<Comment> comments, Long userId) {
        Set<Long> likedIds = userId == null
                ? new HashSet<>()
                : new HashSet<>(commentLikeRepository.findCommentIdsLikedBy(userId));

        comments.forEach(c -> {
            c.setLikesCount(commentLikeRepository.countByCommentId(c.getId()));
            c.setLiked(likedIds.contains(c.getId()));
        });
    }

    /**
     * POST /api/comments — add a comment, or a reply when parentId is set.
     * The author always comes from the token.
     */
    @PostMapping
    @Transactional
    public ResponseEntity<?> addComment(@CurrentUser Long userId, @RequestBody Comment comment) {
        if (comment.getPostId() == null) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "postId is required"));
        }
        if (comment.getText() == null || comment.getText().isBlank()) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "Comment text is required"));
        }
        if (comment.getText().length() > 1000) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "Keep comments under 1,000 characters"));
        }
        comment.setText(comment.getText().trim());

        Post post = postRepository.findById(comment.getPostId()).orElse(null);
        if (post == null) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "Post not found: " + comment.getPostId()));
        }

        User author = userRepository.findById(userId).orElse(null);
        if (author == null) {
            return ResponseEntity.status(401).body(Collections.singletonMap("message", "Sign in to continue"));
        }

        if (comment.getParentId() != null) {
            Comment parent = commentRepository.findById(comment.getParentId()).orElse(null);
            if (parent == null || !parent.getPostId().equals(comment.getPostId())) {
                return ResponseEntity.badRequest()
                        .body(Collections.singletonMap("message", "The comment being replied to does not belong to this post"));
            }
            // Keep threads one level deep: replying to a reply attaches to the
            // same parent rather than nesting further.
            comment.setParentId(parent.getParentId() != null ? parent.getParentId() : parent.getId());
        }

        comment.setId(null);
        comment.setAuthorId(author.getId());
        // Prefer the profile name, which is what the rest of the app shows — a
        // comment byline should not disagree with the profile it links to.
        comment.setAuthorName(profileInfoRepository.findByUserId(author.getId())
                .map(info -> info.getDisplayName())
                .filter(name -> name != null && !name.isBlank())
                .orElseGet(() -> author.getDisplayName() != null ? author.getDisplayName() : author.getUsername()));
        comment.setAvatar(author.getAvatar());
        comment.setBgClass(author.getBgClass());

        Comment saved = commentRepository.save(comment);

        post.setCommentsCount((int) commentRepository.countByPostId(post.getId()));
        postRepository.save(post);

        if (saved.getParentId() != null) {
            // Tell whoever is being replied to.
            commentRepository.findById(saved.getParentId()).ifPresent(parent ->
                    notificationService.notify(parent.getAuthorId(), userId, NotificationService.COMMENT_REPLY,
                            Notification.builder()
                                    .postId(post.getId())
                                    .commentId(saved.getId())
                                    .excerpt(NotificationService.excerpt(saved.getText()))));
        } else {
            notificationService.notify(post.getAuthorId(), userId, NotificationService.POST_COMMENT,
                    Notification.builder()
                            .postId(post.getId())
                            .commentId(saved.getId())
                            .excerpt(NotificationService.excerpt(saved.getText())));
        }

        saved.setLikesCount(0);
        saved.setLiked(false);
        return ResponseEntity.ok(saved);
    }

    /** PUT /api/comments/{id}/like — toggle the signed-in user's like. */
    @PutMapping("/{id}/like")
    @Transactional
    public ResponseEntity<?> toggleLike(@CurrentUser Long userId, @PathVariable Long id) {
        Comment comment = commentRepository.findById(id).orElse(null);
        if (comment == null) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "Comment not found: " + id));
        }

        boolean nowLiked = commentLikeRepository.findByCommentIdAndUserId(id, userId)
                .map(existing -> {
                    commentLikeRepository.delete(existing);
                    return false;
                })
                .orElseGet(() -> {
                    commentLikeRepository.save(CommentLike.builder().commentId(id).userId(userId).build());
                    return true;
                });

        commentLikeRepository.flush();
        comment.setLikesCount(commentLikeRepository.countByCommentId(id));
        comment.setLiked(nowLiked);

        if (nowLiked) {
            notificationService.notify(comment.getAuthorId(), userId, NotificationService.COMMENT_LIKE,
                    Notification.builder()
                            .postId(comment.getPostId())
                            .commentId(comment.getId())
                            .excerpt(NotificationService.excerpt(comment.getText())));
        }

        return ResponseEntity.ok(comment);
    }

    /** DELETE /api/comments/{id} — author only; removes its replies and likes too. */
    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<?> delete(@CurrentUser Long userId, @PathVariable Long id) {
        Comment comment = commentRepository.findById(id).orElse(null);
        if (comment == null) return ResponseEntity.noContent().build();

        if (!userId.equals(comment.getAuthorId())) {
            return ResponseEntity.status(403)
                    .body(Collections.singletonMap("message", "That comment is not yours to delete"));
        }

        // Replies would otherwise be orphaned and never rendered again.
        for (Comment reply : commentRepository.findByParentIdOrderByCreatedAtAsc(id)) {
            commentLikeRepository.deleteByCommentId(reply.getId());
            commentRepository.delete(reply);
        }
        commentLikeRepository.deleteByCommentId(id);
        commentRepository.delete(comment);

        Post post = postRepository.findById(comment.getPostId()).orElse(null);
        if (post != null) {
            post.setCommentsCount((int) commentRepository.countByPostId(post.getId()));
            postRepository.save(post);
        }

        return ResponseEntity.noContent().build();
    }
}
