package com.conexus.controller;

import com.conexus.dto.PublicProfile;
import com.conexus.model.Creator;
import com.conexus.model.ProfileInfo;
import com.conexus.model.User;
import com.conexus.repository.ConnectionRepository;
import com.conexus.repository.CreatorRepository;
import com.conexus.repository.ProfileInfoRepository;
import com.conexus.repository.SocialAccountRepository;
import com.conexus.repository.UserRepository;
import com.conexus.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserRepository userRepository;
    private final ProfileInfoRepository profileInfoRepository;
    private final SocialAccountRepository socialAccountRepository;
    private final CreatorRepository creatorRepository;
    private final ConnectionRepository connectionRepository;

    /**
     * GET /api/users/{id} — another user's public profile.
     *
     * /api/profile only ever returns the caller's own, so without this there is
     * no way to open the person behind a post, comment or conversation.
     */
    @GetMapping("/{id}")
    public ResponseEntity<?> getPublicProfile(@CurrentUser Long callerId, @PathVariable Long id) {
        User user = userRepository.findById(id).orElse(null);
        if (user == null) {
            return ResponseEntity.status(404).body(Collections.singletonMap("message", "User not found"));
        }

        // The profile row holds what the user edited; fall back to the account.
        ProfileInfo info = profileInfoRepository.findByUserId(id).orElse(null);

        String creatorId = creatorRepository.findAll().stream()
                .filter(c -> id.equals(c.getUserId()))
                .map(Creator::getId)
                .findFirst()
                .orElse(null);

        boolean connected = creatorId != null
                && connectionRepository.findByRequesterIdAndTargetCreatorId(callerId, creatorId).isPresent();

        return ResponseEntity.ok(PublicProfile.builder()
                .id(user.getId())
                .username(user.getUsername())
                .displayName(info != null && info.getDisplayName() != null ? info.getDisplayName() : user.getDisplayName())
                .handle(info != null && info.getHandle() != null ? info.getHandle() : "@" + user.getUsername())
                .niche(user.getNiche())
                .category(user.getCategory())
                .location(info != null && info.getLocation() != null ? info.getLocation() : user.getLocation())
                .followers(user.getFollowers())
                .avatar(user.getAvatar())
                .bgClass(user.getBgClass())
                .bio(info != null && info.getBio() != null ? info.getBio() : user.getBio())
                .totalReach(info != null && info.getTotalReach() != null ? info.getTotalReach() : user.getTotalReach())
                .engagement(info != null && info.getEngagement() != null ? info.getEngagement() : user.getEngagement())
                .accountType(user.getAccountType())
                .socials(socialAccountRepository.findByUserId(id))
                .creatorId(creatorId)
                .connected(connected)
                .build());
    }
}
