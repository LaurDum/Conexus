package com.conexus.service;

import com.conexus.model.SocialAccount;
import com.conexus.repository.SocialAccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class SocialAccountService {

    private final SocialAccountRepository socialAccountRepository;

    /** Supported platforms: key → { display name, icon }. */
    private static final Map<String, String[]> PLATFORMS = new LinkedHashMap<>();
    static {
        PLATFORMS.put("youtube",   new String[] { "YouTube", "▶" });
        PLATFORMS.put("tiktok",    new String[] { "TikTok", "🎵" });
        PLATFORMS.put("instagram", new String[] { "Instagram", "📷" });
        PLATFORMS.put("twitch",    new String[] { "Twitch", "👾" });
        PLATFORMS.put("twitter",   new String[] { "X (Twitter)", "𝕏" });
        PLATFORMS.put("discord",   new String[] { "Discord", "💬" });
        PLATFORMS.put("spotify",   new String[] { "Spotify", "🎧" });
        PLATFORMS.put("substack",  new String[] { "Substack", "📰" });
        PLATFORMS.put("linkedin",  new String[] { "LinkedIn", "💼" });
        PLATFORMS.put("website",   new String[] { "Website", "🌐" });
    }

    public static boolean isKnownPlatform(String platform) {
        return platform != null && PLATFORMS.containsKey(platform.toLowerCase());
    }

    /** Fills the display fields from the platform key rather than trusting the request. */
    public static void applyPlatformMeta(SocialAccount account) {
        String key = account.getPlatform().toLowerCase();
        String[] meta = PLATFORMS.getOrDefault(key, PLATFORMS.get("website"));
        account.setPlatform(key);
        account.setName(meta[0]);
        account.setIcon(meta[1]);
        account.setCssClass("platform-" + key);
    }

    /**
     * Returns the link as an absolute http(s) URL, or null when it is not one.
     * Profiles are shown to other people, so a javascript: or data: link here
     * would run in whoever clicks it.
     */
    public static String normalizeUrl(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String url = raw.trim();
        if (!url.matches("(?i)^[a-z][a-z0-9+.-]*:.*")) {
            url = "https://" + url.replaceFirst("^/+", "");
        }
        try {
            URI uri = new URI(url);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
            if (!scheme.equals("http") && !scheme.equals("https")) return null;
            if (uri.getHost() == null || uri.getHost().isBlank()) return null;
            return url;
        } catch (Exception e) {
            return null;
        }
    }

    public List<SocialAccount> getByUserId(Long userId) {
        return socialAccountRepository.findByUserId(userId);
    }

    @Transactional
    public SocialAccount save(SocialAccount account) {
        return socialAccountRepository.save(account);
    }

    public boolean exists(String id) {
        return socialAccountRepository.existsById(id);
    }

    /** True only when this social account exists and belongs to the given user. */
    public boolean isOwnedBy(String id, Long userId) {
        return socialAccountRepository.findById(id)
                .map(account -> userId != null && userId.equals(account.getUserId()))
                .orElse(false);
    }

    @Transactional
    public void delete(String id) {
        socialAccountRepository.deleteById(id);
    }
}
