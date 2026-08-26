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
}
