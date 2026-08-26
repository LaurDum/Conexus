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

        if (updated.getDisplayName() != null) existing.setDisplayName(updated.getDisplayName());
        if (updated.getHandle() != null)      existing.setHandle(updated.getHandle());
        if (updated.getBio() != null)         existing.setBio(updated.getBio());
        if (updated.getLocation() != null)    existing.setLocation(updated.getLocation());
        if (updated.getTotalReach() != null)  existing.setTotalReach(updated.getTotalReach());
        if (updated.getEngagement() != null)  existing.setEngagement(updated.getEngagement());

        return profileInfoRepository.save(existing);
    }
}
