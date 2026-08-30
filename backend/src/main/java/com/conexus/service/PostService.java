package com.conexus.service;

import com.conexus.model.Post;
import com.conexus.model.PostLike;
import com.conexus.repository.PostLikeRepository;
import com.conexus.repository.PostRepository;
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

    @Transactional
    public Post create(Post post) {
        Post saved = postRepository.save(post);
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
        return saved;
    }

    /** True only when this post exists and was written by the given user. */
    public boolean isAuthoredBy(Long postId, Long userId) {
        return postRepository.findById(postId)
                .map(post -> userId != null && userId.equals(post.getAuthorId()))
                .orElse(false);
    }

    @Transactional
    public void delete(Long id) {
        postRepository.deleteById(id);
    }
}
