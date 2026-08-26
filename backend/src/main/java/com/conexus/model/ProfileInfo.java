package com.conexus.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import javax.persistence.*;

/**
 * The logged-in user's profile information.
 * For this single-user MVP there is only one row (id = 1).
 */
@Entity
@Table(name = "profile_info")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProfileInfo {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Owner user ID */
    private Long userId;

    private String displayName;
    private String handle;

    @Column(columnDefinition = "TEXT")
    private String bio;

    private String location;
    private String totalReach;
    private String engagement;
}
