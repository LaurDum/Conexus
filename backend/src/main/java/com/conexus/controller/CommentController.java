package com.conexus.controller;

import com.conexus.model.Comment;
import com.conexus.model.Post;
import com.conexus.model.User;
import com.conexus.repository.CommentRepository;
import com.conexus.repository.PostRepository;
import com.conexus.repository.UserRepository;
import com.conexus.security.CurrentUser;
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
    private final UserRepository userRepository;

    @GetMapping
    public List<Comment> getComments(@RequestParam Long postId) {
        return commentRepository.findByPostIdOrderByCreatedAtAsc(postId);
    }

    /**
     * Persists a comment and keeps the parent post's commentsCount in sync.
     * The author is taken from the token, so nobody can comment as someone else.
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

        Post post = postRepository.findById(comment.getPostId()).orElse(null);
        if (post == null) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "Post not found: " + comment.getPostId()));
        }

        User author = userRepository.findById(userId).orElse(null);
        if (author == null) {
            return ResponseEntity.status(401).body(Collections.singletonMap("message", "Sign in to continue"));
        }

        comment.setId(null);
        comment.setAuthorId(author.getId());
        comment.setAuthorName(author.getDisplayName() != null ? author.getDisplayName() : author.getUsername());
        comment.setAvatar(author.getAvatar());
        comment.setBgClass(author.getBgClass());

        Comment saved = commentRepository.save(comment);

        post.setCommentsCount((int) commentRepository.countByPostId(post.getId()));
        postRepository.save(post);

        return ResponseEntity.ok(saved);
    }
}
