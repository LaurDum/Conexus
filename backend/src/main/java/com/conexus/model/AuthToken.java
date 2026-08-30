package com.conexus.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import javax.persistence.*;
import java.time.Instant;

/**
 * A session token issued at login or registration.
 *
 * Tokens used to be generated with UUID.randomUUID(), handed to the browser and
 * then forgotten — nothing stored them and nothing checked them, so every API
 * endpoint was open to anyone who knew a user id. Storing them here is what
 * makes authentication real.
 */
@Entity
@Table(name = "auth_tokens", indexes = @Index(name = "idx_auth_tokens_token", columnList = "token"))
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AuthToken {

    @Id
    @Column(nullable = false, unique = true, length = 64)
    private String token;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant expiresAt;

    public boolean isExpired() {
        return Instant.now().isAfter(expiresAt);
    }
}
