package com.conexus.controller;

import com.conexus.model.Comment;
import com.conexus.model.Post;
import com.conexus.repository.CommentRepository;
import com.conexus.repository.PostRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.List;

@RestController
@RequestMapping("/api/comments")
@RequiredArgsConstructor
public class CommentController {

    private final CommentRepository commentRepository;
    private final PostRepository postRepository;

    @GetMapping
    public List<Comment> getComments(@RequestParam Long postId) {
        return commentRepository.findByPostIdOrderByCreatedAtAsc(postId);
    }

    /**
     * Persists a comment and keeps the parent post's commentsCount in sync, so
     * the count shown on the feed survives a reload.
     */
    @PostMapping
    @Transactional
    public ResponseEntity<?> addComment(@RequestBody Comment comment) {
        if (comment.getPostId() == null) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "postId is required"));
        }
        if (comment.getText() == null || comment.getText().isBlank()) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "Comment text is required"));
        }

        Post post = postRepository.findById(comment.getPostId()).orElse(null);
        if (post == null) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "Post not found: " + comment.getPostId()));
        }

        comment.setId(null);
        Comment saved = commentRepository.save(comment);

        post.setCommentsCount((int) commentRepository.countByPostId(post.getId()));
        postRepository.save(post);

        return ResponseEntity.ok(saved);
    }
}
