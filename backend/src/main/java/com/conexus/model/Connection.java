package com.conexus.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import javax.persistence.*;
import java.time.Instant;

/**
 * A connection between two users (e.g. following / friend request).
 */
@Entity
@Table(name = "connections")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Connection {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long requesterId;

    private String targetCreatorId; // The ID of the Creator entity they are connecting with

    /**
     * The account behind that creator card, when there is one. A card nobody
     * has signed up as has nobody who could accept.
     */
    private Long targetUserId;

    /**
     * PENDING until the other person accepts. A card with no account behind it
     * is ACCEPTED straight away — there is nothing to wait for.
     */
    @Builder.Default
    @Column(nullable = false)
    private String status = "PENDING";

    @CreationTimestamp
    @Column(updatable = false)
    private Instant createdAt;
}
