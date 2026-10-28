package com.conexus.user;

import com.conexus.auth.AuthDTOs;
import com.conexus.auth.CurrentUser;
import com.conexus.social.SocialAccount;
import com.conexus.social.SocialAccountRepository;
import com.conexus.social.SocialAccountService;
import com.conexus.stats.ReachService;
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
    private final SocialAccountRepository socialAccountRepository;
    private final ReachService reachService;

    @PostMapping("/complete")
    @Transactional
    public ResponseEntity<?> completeOnboarding(@CurrentUser Long currentUserId,
                                                @RequestBody AuthDTOs.OnboardingRequest req) {
        // The account being onboarded is always the caller's own. The userId in
        // the request body used to be trusted, which let anyone complete (and
        // rewrite the profile of) any account.
        User user = userRepository.findById(currentUserId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        user.setAccountType(req.getAccountType() != null ? req.getAccountType() : "creator");
        user.setGoals(req.getGoals());
        if (req.getBio() != null && !req.getBio().isBlank()) user.setBio(req.getBio());
        if (req.getLocation() != null && !req.getLocation().isBlank()) user.setLocation(req.getLocation());
        user.setOnboardingComplete(true);
        userRepository.save(user);

        if (user.getHandle() == null) user.setHandle("@" + user.getUsername());
        userRepository.save(user);

        // Save Social Accounts if provided
        if (req.getSocials() != null) {
            for (AuthDTOs.SocialAccountDTO soc : req.getSocials()) {
                if (!SocialAccountService.isKnownPlatform(soc.getPlatform())
                        || soc.getHandle() == null || soc.getHandle().isBlank()) continue;

                String platform = soc.getPlatform().toLowerCase();
                String handle = soc.getHandle().trim();
                String url = SocialAccountService.normalizeUrl(soc.getUrl());
                if (url == null) url = defaultUrl(platform, handle);
                if (url == null) continue;

                SocialAccount sa = SocialAccount.builder()
                        .id("soc_" + UUID.randomUUID().toString().substring(0, 8))
                        .userId(user.getId())
                        .platform(platform)
                        .handle(handle)
                        .url(url)
                        .followers(soc.getFollowers() != null ? soc.getFollowers() : "0")
                        .build();
                SocialAccountService.applyPlatformMeta(sa);

                socialAccountRepository.save(sa);
            }
        }

        reachService.record(user.getId());

        // The caller keeps the token they already signed in with; onboarding is
        // not an authentication event.
        AuthDTOs.AuthResponse response = new AuthDTOs.AuthResponse(
                user.getId(),
                user.getUsername(),
                user.getEmail(),
                user.getDisplayName(),
                user.getNiche(),
                user.getAvatar(),
                user.getBgClass(),
                null,
                user.getAccountType(),
                user.isOnboardingComplete()
        );

        return ResponseEntity.ok(response);
    }

    /** The profile link a handle implies, when onboarding gave no URL. */
    private String defaultUrl(String platform, String handle) {
        String name = handle.replaceFirst("^@", "");
        switch (platform) {
            case "youtube":   return SocialAccountService.normalizeUrl("https://youtube.com/@" + name);
            case "tiktok":    return SocialAccountService.normalizeUrl("https://tiktok.com/@" + name);
            case "instagram": return SocialAccountService.normalizeUrl("https://instagram.com/" + name);
            case "twitch":    return SocialAccountService.normalizeUrl("https://twitch.tv/" + name);
            case "twitter":   return SocialAccountService.normalizeUrl("https://x.com/" + name);
            case "website":   return SocialAccountService.normalizeUrl(name);
            default:          return null;
        }
    }
}
