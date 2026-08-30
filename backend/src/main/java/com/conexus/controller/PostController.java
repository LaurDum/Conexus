package com.conexus.controller;

import com.conexus.model.Post;
import com.conexus.security.CurrentUser;
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

    /** GET /api/posts — newest first, `liked` resolved for the signed-in user. */
    @GetMapping
    public List<Post> getAll(@CurrentUser Long userId) {
        return postService.getAll(userId);
    }

    /** POST /api/posts — publish as the signed-in user. */
    @PostMapping
    public ResponseEntity<?> create(@CurrentUser Long userId, @RequestBody Post post) {
        if (post.getContent() == null || post.getContent().isBlank()) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "Post content is required"));
        }
        if (post.getAuthorName() == null || post.getAuthorName().isBlank()) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "authorName is required"));
        }
        post.setId(null);          // always insert, never overwrite an existing post
        post.setAuthorId(userId);  // authorship comes from the token, not the body
        return ResponseEntity.ok(postService.create(post));
    }

    /** PUT /api/posts/{id}/like — toggle the signed-in user's like. */
    @PutMapping("/{id}/like")
    public ResponseEntity<?> like(@CurrentUser Long userId, @PathVariable Long id) {
        try {
            return ResponseEntity.ok(postService.toggleLike(id, userId));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", e.getMessage()));
        }
    }

    /** DELETE /api/posts/{id} — only the author may delete. */
    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@CurrentUser Long userId, @PathVariable Long id) {
        if (!postService.isAuthoredBy(id, userId)) {
            return ResponseEntity.status(403)
                    .body(Collections.singletonMap("message", "That post is not yours to delete"));
        }
        postService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
