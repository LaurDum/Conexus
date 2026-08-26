package com.conexus.controller;

import com.conexus.model.Post;
import com.conexus.service.PostService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.List;

@RestController
@RequestMapping("/api/posts")
@RequiredArgsConstructor
public class PostController {

    private final PostService postService;

    /** GET /api/posts?userId=123 — newest first, `liked` resolved for that user */
    @GetMapping
    public List<Post> getAll(@RequestParam(required = false) Long userId) {
        return postService.getAll(userId);
    }

    /** POST /api/posts — create a new post */
    @PostMapping
    public ResponseEntity<?> create(@RequestBody Post post) {
        if (post.getContent() == null || post.getContent().isBlank()) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "Post content is required"));
        }
        if (post.getAuthorName() == null || post.getAuthorName().isBlank()) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "authorName is required"));
        }
        post.setId(null); // always insert, never overwrite an existing post
        return ResponseEntity.ok(postService.create(post));
    }

    /**
     * PUT /api/posts/{id}/like?userId=123 — toggle this user's like.
     * userId is required: without it a like has no owner and would be shared
     * by every account.
     */
    @PutMapping("/{id}/like")
    public ResponseEntity<?> like(@PathVariable Long id, @RequestParam(required = false) Long userId) {
        if (userId == null) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "userId is required to like a post"));
        }
        try {
            return ResponseEntity.ok(postService.toggleLike(id, userId));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", e.getMessage()));
        }
    }

    /** DELETE /api/posts/{id} */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        postService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
