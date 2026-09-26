package com.conexus.controller;

import com.conexus.model.Post;
import com.conexus.security.CurrentUser;
import com.conexus.service.PostService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.List;
import java.util.concurrent.TimeUnit;

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

    /** POST /api/posts — publish as the signed-in user, with an optional photo. */
    @PostMapping
    public ResponseEntity<?> create(@CurrentUser Long userId, @RequestBody CreatePostRequest req) {
        boolean hasText = req.getContent() != null && !req.getContent().isBlank();
        boolean hasImage = req.getImage() != null && !req.getImage().isBlank();

        if (!hasText && !hasImage) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "Write something or add a photo"));
        }
        if (hasText && req.getContent().length() > 2000) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "Keep posts under 2,000 characters"));
        }

        try {
            return ResponseEntity.ok(postService.create(userId, req.getContent(), req.getNiche(), req.getImage()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", e.getMessage()));
        }
    }

    /** GET /api/posts/{id}/image — the post's photo, for signed-in users. */
    @GetMapping("/{id}/image")
    public ResponseEntity<byte[]> image(@PathVariable Long id) {
        return postService.imageFor(id)
                .map(img -> ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(img.getContentType()))
                        .cacheControl(CacheControl.maxAge(7, TimeUnit.DAYS).cachePrivate())
                        .body(img.getData()))
                .orElse(ResponseEntity.notFound().build());
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

    @Data
    public static class CreatePostRequest {
        private String content;
        private String niche;
        /** Optional photo as a data: URL (JPEG or PNG). */
        private String image;
    }
}
