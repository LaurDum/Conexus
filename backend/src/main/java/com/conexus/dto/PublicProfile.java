package com.conexus.dto;

import com.conexus.model.SocialAccount;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * What one signed-in user may see of another.
 *
 * Deliberately a DTO rather than the User entity: that carries the email and
 * the password hash, and returning it would leak both.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PublicProfile {

    private Long id;
    private String username;
    private String displayName;
    private String handle;
    private String niche;
    private String category;
    private String location;
    private String followers;
    private String avatar;
    private String bgClass;
    private String bio;
    private String totalReach;
    private String engagement;
    private String accountType;

    /** The public links this user has chosen to show. */
    private List<SocialAccount> socials;

    /** The discover card for this account, when they have one. */
    private String creatorId;

    /** Whether the caller has already connected with them. */
    private boolean connected;

    /** PENDING or ACCEPTED when connected, otherwise null. */
    private String connectionStatus;
}
