package com.conexus.controller;

import com.conexus.dto.AuthDTOs;
import com.conexus.model.ProfileInfo;
import com.conexus.model.SocialAccount;
import com.conexus.model.User;
import com.conexus.repository.ProfileInfoRepository;
import com.conexus.repository.SocialAccountRepository;
import com.conexus.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.UUID;

@RestController
@RequestMapping("/api/onboarding")
@RequiredArgsConstructor
public class OnboardingController {

    private final UserRepository userRepository;
    private final ProfileInfoRepository profileInfoRepository;
    private final SocialAccountRepository socialAccountRepository;

    @PostMapping("/complete")
    @Transactional
    public ResponseEntity<?> completeOnboarding(@RequestBody AuthDTOs.OnboardingRequest req) {
        if (req.getUserId() == null) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "User ID is required"));
        }

        User user = userRepository.findById(req.getUserId())
                .orElseThrow(() -> new RuntimeException("User not found"));

        user.setAccountType(req.getAccountType() != null ? req.getAccountType() : "creator");
        user.setGoals(req.getGoals());
        if (req.getBio() != null && !req.getBio().isBlank()) user.setBio(req.getBio());
        if (req.getLocation() != null && !req.getLocation().isBlank()) user.setLocation(req.getLocation());
        user.setOnboardingComplete(true);
        userRepository.save(user);

        // Update / create ProfileInfo
        ProfileInfo profile = profileInfoRepository.findByUserId(user.getId())
                .orElseGet(() -> ProfileInfo.builder().userId(user.getId()).build());
        
        profile.setDisplayName(user.getDisplayName());
        profile.setHandle("@" + user.getUsername());
        profile.setBio(req.getBio() != null ? req.getBio() : "Creator on Conexus.");
        profile.setLocation(req.getLocation() != null ? req.getLocation() : "Worldwide");
        profile.setTotalReach(user.getTotalReach() != null ? user.getTotalReach() : "0");
        profile.setEngagement(user.getEngagement() != null ? user.getEngagement() : "0%");
        profileInfoRepository.save(profile);

        // Save Social Accounts if provided
        if (req.getSocials() != null) {
            for (AuthDTOs.SocialAccountDTO soc : req.getSocials()) {
                if (soc.getPlatform() == null || soc.getHandle() == null) continue;
                
                String icon = getPlatformIcon(soc.getPlatform());
                String cssClass = "platform-" + soc.getPlatform().toLowerCase();
                String name = capitalize(soc.getPlatform());
                String url = soc.getUrl() != null && !soc.getUrl().isBlank() 
                        ? soc.getUrl() 
                        : "https://" + soc.getPlatform().toLowerCase() + ".com/" + soc.getHandle().replace("@", "");

                SocialAccount sa = SocialAccount.builder()
                        .id("soc_" + UUID.randomUUID().toString().substring(0, 8))
                        .userId(user.getId())
                        .platform(soc.getPlatform().toLowerCase())
                        .name(name)
                        .handle(soc.getHandle())
                        .url(url)
                        .followers(soc.getFollowers() != null ? soc.getFollowers() : "0")
                        .icon(icon)
                        .cssClass(cssClass)
                        .build();

                socialAccountRepository.save(sa);
            }
        }

        String token = UUID.randomUUID().toString();
        AuthDTOs.AuthResponse response = new AuthDTOs.AuthResponse(
                user.getId(),
                user.getUsername(),
                user.getEmail(),
                user.getDisplayName(),
                user.getNiche(),
                user.getAvatar(),
                user.getBgClass(),
                token,
                user.getAccountType(),
                user.isOnboardingComplete()
        );

        return ResponseEntity.ok(response);
    }

    private String getPlatformIcon(String platform) {
        switch (platform.toLowerCase()) {
            case "youtube": return "▶";
            case "tiktok": return "🎵";
            case "instagram": return "📷";
            case "twitch": return "👾";
            case "twitter": return "𝕏";
            case "discord": return "💬";
            case "spotify": return "🎧";
            case "substack": return "📰";
            case "linkedin": return "💼";
            default: return "🌐";
        }
    }

    private String capitalize(String str) {
        if (str == null || str.isEmpty()) return str;
        return str.substring(0, 1).toUpperCase() + str.substring(1);
    }
}
