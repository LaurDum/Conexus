package com.conexus.service;

import com.conexus.model.ProfileInfo;
import com.conexus.repository.ProfileInfoRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ProfileInfoService {

    private final ProfileInfoRepository profileInfoRepository;

    /**
     * Returns the profile for a specific user ID.
     * If none exists yet, returns a default profile.
     */
    public ProfileInfo getByUserId(Long userId) {
        if (userId == null) {
            return getFallbackDefault();
        }
        return profileInfoRepository.findByUserId(userId)
                .orElseGet(() -> getFallbackDefault(userId));
    }

    private ProfileInfo getFallbackDefault() {
        return ProfileInfo.builder()
                .displayName("User")
                .handle("@user")
                .bio("Creator on Conexus.")
                .location("Worldwide")
                .totalReach("0")
                .engagement("0%")
                .build();
    }

    private ProfileInfo getFallbackDefault(Long userId) {
        ProfileInfo info = getFallbackDefault();
        info.setUserId(userId);
        return info;
    }

    @Transactional
    public ProfileInfo update(Long userId, ProfileInfo updated) {
        // Without a userId we would create a new orphan row on every save, so the
        // edit would silently "not persist" from the user's point of view.
        if (userId == null) {
            throw new IllegalArgumentException("userId is required to update a profile");
        }

        ProfileInfo existing = profileInfoRepository.findByUserId(userId)
                .orElseGet(() -> ProfileInfo.builder().userId(userId).build());

        // A blank name would leave the byline empty everywhere it is shown.
        if (updated.getDisplayName() != null && !updated.getDisplayName().isBlank()) {
            existing.setDisplayName(updated.getDisplayName().trim());
        }
        if (updated.getHandle() != null && !updated.getHandle().isBlank()) {
            String handle = updated.getHandle().trim();
            existing.setHandle(handle.startsWith("@") ? handle : "@" + handle);
        }
        if (updated.getBio() != null)      existing.setBio(updated.getBio().trim());
        if (updated.getLocation() != null) existing.setLocation(updated.getLocation().trim());
        // Reach and engagement are shown to other people as metrics, so they
        // are not something a profile edit can type in.

        return profileInfoRepository.save(existing);
    }
}
