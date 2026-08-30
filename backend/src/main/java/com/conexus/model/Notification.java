package com.conexus.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import javax.persistence.*;
import java.time.Instant;

/**
 * Something another account did that concerns this user.
 *
 * The actor's name and avatar are copied in rather than joined, so a
 * notification still reads correctly if that person later renames themselves —
 * and so listing an inbox is one query.
 */
@Entity
@Table(name = "notifications", indexes = @Index(name = "idx_notifications_user", columnList = "user_id"))
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Who receives it. */
    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** Who caused it. */
    private Long actorId;
    private String actorName;
    private String actorAvatar;
    private String actorBgClass;

    /** POST_LIKE, POST_COMMENT, COMMENT_REPLY, COMMENT_LIKE, CONNECTION, MESSAGE */
    @Column(nullable = false)
    private String type;

    /** Where clicking it should take you. Only the relevant one is set. */
    private Long postId;
    private Long commentId;
    private String threadId;

    /** A short excerpt of what was said, when there is one. */
    @Column(columnDefinition = "TEXT")
    private String excerpt;

    @Builder.Default
    private boolean read = false;

    @CreationTimestamp
    @Column(updatable = false)
    private Instant createdAt;
}
