package com.conexus.user;

import com.conexus.auth.AuthService;
import com.conexus.auth.CurrentUser;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;

/**
 * DELETE /api/account — removes the account and what it made: posts, comments,
 * likes, listings, linked channels, sessions. Conversations stay in the other
 * person's inbox, since those are theirs too, but no longer deliver anywhere.
 */
@RestController
@RequestMapping("/api/account")
@RequiredArgsConstructor
@Slf4j
public class AccountController {

    private final AuthService authService;
    private final JdbcTemplate jdbc;

    @DeleteMapping
    @Transactional
    public ResponseEntity<?> delete(@CurrentUser Long userId, @RequestBody DeleteRequest req) {
        if (req == null || !authService.checkPassword(userId, req.getPassword())) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "That password is not right"));
        }

        // Their posts, with everything hanging off them.
        String myPosts = "SELECT id FROM posts WHERE author_id = ?";
        String commentsOnMyPosts = "SELECT id FROM comments WHERE post_id IN (" + myPosts + ")";
        jdbc.update("DELETE FROM comment_likes WHERE comment_id IN (" + commentsOnMyPosts + ")", userId);
        jdbc.update("DELETE FROM notifications WHERE post_id IN (" + myPosts + ")", userId);
        jdbc.update("DELETE FROM comments WHERE post_id IN (" + myPosts + ")", userId);
        jdbc.update("DELETE FROM post_likes WHERE post_id IN (" + myPosts + ")", userId);
        jdbc.update("DELETE FROM post_images WHERE post_id IN (" + myPosts + ")", userId);
        jdbc.update("DELETE FROM posts WHERE author_id = ?", userId);

        // Their comments elsewhere, and the replies under them.
        String myComments = "SELECT id FROM comments WHERE author_id = ? OR parent_id IN "
                + "(SELECT id FROM comments WHERE author_id = ?)";
        jdbc.update("DELETE FROM comment_likes WHERE comment_id IN (" + myComments + ")", userId, userId);
        jdbc.update("DELETE FROM notifications WHERE comment_id IN (" + myComments + ")", userId, userId);
        jdbc.update("DELETE FROM comments WHERE id IN (SELECT id FROM (" + myComments + ") AS doomed)", userId, userId);

        jdbc.update("DELETE FROM comment_likes WHERE user_id = ?", userId);
        jdbc.update("DELETE FROM post_likes WHERE user_id = ?", userId);
        jdbc.update("UPDATE posts SET likes_count = (SELECT count(*) FROM post_likes l WHERE l.post_id = posts.id), "
                + "comments_count = (SELECT count(*) FROM comments c WHERE c.post_id = posts.id)");

        jdbc.update("DELETE FROM notifications WHERE user_id = ? OR actor_id = ?", userId, userId);
        jdbc.update("DELETE FROM connections WHERE requester_id = ? OR target_user_id = ?", userId, userId);

        // Their own inbox goes; the other side keeps its copy, now undeliverable.
        jdbc.update("DELETE FROM chat_messages WHERE thread_id IN (SELECT id FROM chat_threads WHERE user_id = ?)", userId);
        jdbc.update("DELETE FROM chat_threads WHERE user_id = ?", userId);
        jdbc.update("UPDATE chat_threads SET partner_user_id = NULL WHERE partner_user_id = ?", userId);

        jdbc.update("DELETE FROM job_applications WHERE applicant_user_id = ? "
                + "OR job_id IN (SELECT id FROM jobs WHERE posted_by_user_id = ?)", userId, userId);
        jdbc.update("DELETE FROM jobs WHERE posted_by_user_id = ?", userId);

        // A discover card they claimed goes back to being unclaimed.
        jdbc.update("UPDATE creators SET user_id = NULL WHERE user_id = ?", userId);
        jdbc.update("DELETE FROM reach_snapshots WHERE user_id = ?", userId);
        jdbc.update("DELETE FROM social_accounts WHERE user_id = ?", userId);
        if (tableExists("profile_info_merged")) {
            jdbc.update("DELETE FROM profile_info_merged WHERE user_id = ?", userId);
        }
        jdbc.update("DELETE FROM auth_tokens WHERE user_id = ?", userId);
        jdbc.update("DELETE FROM users WHERE id = ?", userId);

        log.info("Deleted account {}", userId);
        return ResponseEntity.noContent().build();
    }

    private boolean tableExists(String name) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT to_regclass(?) IS NOT NULL", Boolean.class, "public." + name));
    }

    @Data
    static class DeleteRequest {
        private String password;
    }
}
