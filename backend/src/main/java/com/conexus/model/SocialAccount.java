package com.conexus.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import javax.persistence.*;

/**
 * A social media account linked to a user's profile.
 */
@Entity
@Table(name = "social_accounts")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SocialAccount {

    @Id
    @Column(nullable = false, unique = true)
    private String id;

    /** Owner user ID */
    private Long userId;

    /** Platform key (e.g. "youtube", "tiktok", "instagram") */
    @Column(nullable = false)
    private String platform;

    private String name;
    private String handle;
    private String url;
    private String followers;

    /** Emoji icon for the platform */
    private String icon;

    /** CSS class for styling (e.g. "platform-youtube") */
    @com.fasterxml.jackson.annotation.JsonProperty("class")
    private String cssClass;
}
