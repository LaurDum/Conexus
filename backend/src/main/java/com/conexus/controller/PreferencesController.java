package com.conexus.controller;

import com.conexus.model.User;
import com.conexus.repository.UserRepository;
import com.conexus.security.CurrentUser;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** Per-account settings: which home sections to show, and the theme. */
@RestController
@RequestMapping("/api/preferences")
@RequiredArgsConstructor
public class PreferencesController {

    private final UserRepository userRepository;

    /**
     * Optional sections under the Home overview, in their default order. The
     * overview itself and the feed have their own tabs and are always there.
     */
    private static final List<String> ALLOWED_SECTIONS =
            Arrays.asList("mingle", "jobs", "deals");

    /** What a new account sees. */
    private static final List<String> DEFAULT_SECTIONS =
            Arrays.asList("mingle");

    private static final int MAX_SECTIONS = 3;

    @GetMapping
    public Map<String, Object> get(@CurrentUser Long userId) {
        User user = userRepository.findById(userId).orElse(null);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("homeSections", parseSections(user == null ? null : user.getHomeSections()));
        out.put("theme", user != null && user.getTheme() != null ? user.getTheme() : "dark");
        out.put("available", ALLOWED_SECTIONS);
        out.put("maxSections", MAX_SECTIONS);
        return out;
    }

    @PutMapping
    @Transactional
    public ResponseEntity<?> update(@CurrentUser Long userId, @RequestBody PreferencesRequest req) {
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) {
            return ResponseEntity.status(401).body(Collections.singletonMap("message", "Sign in to continue"));
        }

        if (req.getHomeSections() != null) {
            // Keep only sections that exist, drop duplicates, and cap the count —
            // the client should not be able to widen this by editing the request.
            List<String> cleaned = req.getHomeSections().stream()
                    .filter(ALLOWED_SECTIONS::contains)
                    .distinct()
                    .limit(MAX_SECTIONS)
                    .collect(Collectors.toList());

            // Empty is allowed: the overview on its own is a complete Home.
            // Stored as "none" so it is not mistaken for "never chosen".
            user.setHomeSections(cleaned.isEmpty() ? "none" : String.join(",", cleaned));
        }

        if (req.getTheme() != null) {
            user.setTheme("light".equalsIgnoreCase(req.getTheme()) ? "light" : "dark");
        }

        userRepository.save(user);
        return ResponseEntity.ok(get(userId));
    }

    private List<String> parseSections(String stored) {
        if (stored == null || stored.isBlank()) return DEFAULT_SECTIONS;
        if ("none".equals(stored)) return List.of();

        // Choices saved before the overview existed can name sections that
        // are gone ("recommendations", "inspo"); those are dropped quietly.
        List<String> parsed = Arrays.stream(stored.split(","))
                .map(String::trim)
                .filter(ALLOWED_SECTIONS::contains)
                .distinct()
                .limit(MAX_SECTIONS)
                .collect(Collectors.toList());

        return parsed.isEmpty() ? DEFAULT_SECTIONS : parsed;
    }

    @Data
    public static class PreferencesRequest {
        private List<String> homeSections;
        private String theme;
    }
}
