package com.conexus.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import javax.persistence.*;

@Entity
@Table(name = "users")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String username;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String password;

    private String displayName;
    private String niche;
    private String category;
    private String location;
    private String followers;
    private String avatar;
    private String bgClass;

    @Column(columnDefinition = "TEXT")
    private String bio;

    private String totalReach;
    private String engagement;

    /** "creator" or "business" */
    private String accountType;

    /** Comma-separated goals chosen during onboarding */
    @Column(columnDefinition = "TEXT")
    private String goals;

    @Builder.Default
    @Column(columnDefinition = "boolean default false")
    private boolean onboardingComplete = false;
}
