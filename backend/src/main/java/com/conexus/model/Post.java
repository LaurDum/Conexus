package com.conexus.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import javax.persistence.*;
import javax.validation.constraints.NotBlank;
import java.time.Instant;

/**
 * A post in the Inspo community feed.
 */
@Entity
@Table(name = "posts")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Post {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** ID of the user who authored this post */
    private Long authorId;

    @NotBlank
    private String authorName;

    private String niche;

    @Column(columnDefinition = "TEXT")
    @NotBlank
    private String content;

    @Builder.Default
    private int likesCount = 0;

    /**
     * Whether the user who asked for this post has liked it. Computed per
     * request from post_likes — storing it on the post made one person's like
     * visible to everyone.
     */
    @Transient
    @Builder.Default
    private boolean liked = false;

    @Builder.Default
    private int commentsCount = 0;

    private String avatarClass;

    @CreationTimestamp
    @Column(updatable = false)
    private Instant createdAt;
}
