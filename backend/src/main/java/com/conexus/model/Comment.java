package com.conexus.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import javax.persistence.*;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import java.time.Instant;

/**
 * A comment on an Inspo feed post.
 */
@Entity
@Table(name = "comments")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Comment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @NotNull
    private Long postId;

    private Long authorId;

    /**
     * The comment this one replies to, or null for a top-level comment.
     * Replies are one level deep: a reply to a reply attaches to the same
     * parent, so a thread stays readable rather than nesting indefinitely.
     */
    private Long parentId;

    @NotBlank
    private String authorName;

    private String avatar;

    private String bgClass;

    @Column(columnDefinition = "TEXT")
    @NotBlank
    private String text;

    @CreationTimestamp
    @Column(updatable = false)
    private Instant createdAt;

    /** Derived per request from comment_likes, never stored. */
    @Transient
    private long likesCount;

    /** Whether the user who asked for this comment has liked it. */
    @Transient
    private boolean liked;
}
