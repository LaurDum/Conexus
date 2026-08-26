package com.conexus.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import javax.persistence.*;

/**
 * Represents a content creator discoverable on the platform.
 */
@Entity
@Table(name = "creators")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Creator {

    @Id
    @Column(nullable = false, unique = true)
    private String id;

    /**
     * The account behind this creator card, when there is one. Demo creators
     * that nobody has signed up as leave this null — messaging them cannot be
     * delivered anywhere.
     */
    private Long userId;

    @Column(nullable = false)
    private String name;

    private String niche;
    private String category;
    private String location;
    private String followers;

    @com.fasterxml.jackson.annotation.JsonProperty("match")
    private int matchScore;

    /** Initials shown in the avatar circle (e.g. "AP") */
    private String avatar;

    /** CSS class for the avatar background color (e.g. "avatar-purple") */
    private String bgClass;
}
