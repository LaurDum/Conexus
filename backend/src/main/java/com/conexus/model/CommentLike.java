package com.conexus.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import javax.persistence.*;
import java.time.Instant;

/**
 * One account's like on one comment. Mirrors PostLike: the unique constraint
 * makes a double-like impossible, and the count is derived from these rows
 * rather than kept as a counter that can drift.
 */
@Entity
@Table(
    name = "comment_likes",
    uniqueConstraints = @UniqueConstraint(name = "uk_comment_likes_comment_user", columnNames = {"comment_id", "user_id"})
)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CommentLike {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "comment_id", nullable = false)
    private Long commentId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @CreationTimestamp
    @Column(updatable = false)
    private Instant createdAt;
}
