package com.conexus.controller;

import com.conexus.security.CurrentUser;
import com.conexus.service.ReachService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import javax.persistence.EntityManager;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Recent progress for the Home overview: what happened in the last N days,
 * next to the N days before, so each number can say whether it went up.
 */
@RestController
@RequestMapping("/api/stats")
@RequiredArgsConstructor
public class StatsController {

    private final EntityManager em;
    private final ReachService reachService;

    /** GET /api/stats/progress?days=7 */
    @GetMapping("/progress")
    public Map<String, Object> progress(@CurrentUser Long userId, @RequestParam(defaultValue = "7") int days) {
        int span = Math.max(1, Math.min(days, 90));
        Instant now = Instant.now();
        Instant start = now.minus(Duration.ofDays(span));
        Instant before = start.minus(Duration.ofDays(span));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("days", span);
        out.put("current", window(userId, start, now));
        out.put("previous", window(userId, before, start));
        return out;
    }

    /** GET /api/stats/reach?days=30 — total followers per day, oldest first. */
    @GetMapping("/reach")
    public Map<String, Object> reach(@CurrentUser Long userId, @RequestParam(defaultValue = "30") int days) {
        reachService.record(userId);
        return reachService.history(userId, Math.max(2, Math.min(days, 365)));
    }

    private Map<String, Long> window(Long me, Instant from, Instant to) {
        Map<String, Long> m = new LinkedHashMap<>();

        // Likes other people gave your posts and your comments.
        m.put("likes",
                count("SELECT COUNT(l) FROM PostLike l, Post p WHERE l.postId = p.id AND p.authorId = :me"
                        + " AND l.userId <> :me AND l.createdAt >= :from AND l.createdAt < :to", me, from, to)
              + count("SELECT COUNT(l) FROM CommentLike l, Comment c WHERE l.commentId = c.id AND c.authorId = :me"
                        + " AND l.userId <> :me AND l.createdAt >= :from AND l.createdAt < :to", me, from, to));

        // Comments on your posts, plus replies to your comments on other people's posts.
        m.put("comments",
                count("SELECT COUNT(c) FROM Comment c, Post p WHERE c.postId = p.id AND p.authorId = :me"
                        + " AND c.authorId <> :me AND c.createdAt >= :from AND c.createdAt < :to", me, from, to)
              + count("SELECT COUNT(c) FROM Comment c, Comment parent WHERE c.parentId = parent.id"
                        + " AND parent.authorId = :me AND c.authorId <> :me"
                        + " AND c.postId NOT IN (SELECT p.id FROM Post p WHERE p.authorId = :me)"
                        + " AND c.createdAt >= :from AND c.createdAt < :to", me, from, to));

        // Connections made in either direction that are now accepted.
        m.put("connections",
                count("SELECT COUNT(c) FROM Connection c WHERE (c.requesterId = :me OR c.targetUserId = :me)"
                        + " AND (c.status = 'ACCEPTED' OR c.status IS NULL)"
                        + " AND c.createdAt >= :from AND c.createdAt < :to", me, from, to));

        m.put("posts",
                count("SELECT COUNT(p) FROM Post p WHERE p.authorId = :me"
                        + " AND p.createdAt >= :from AND p.createdAt < :to", me, from, to));
        return m;
    }

    private long count(String jpql, Long me, Instant from, Instant to) {
        return em.createQuery(jpql, Long.class)
                .setParameter("me", me)
                .setParameter("from", from)
                .setParameter("to", to)
                .getSingleResult();
    }
}
