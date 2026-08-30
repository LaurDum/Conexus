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

    /** Sections that may appear on the home screen, in their default order. */
    private static final List<String> ALLOWED_SECTIONS =
            Arrays.asList("recommendations", "mingle", "inspo", "jobs", "deals");

    /** What a new account sees. */
    private static final List<String> DEFAULT_SECTIONS =
            Arrays.asList("recommendations", "mingle", "inspo");

    /** The home screen holds four at most, so it stays a summary. */
    private static final int MAX_SECTIONS = 4;

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

            if (cleaned.isEmpty()) {
                return ResponseEntity.badRequest()
                        .body(Collections.singletonMap("message", "Keep at least one section on your home screen"));
            }
            user.setHomeSections(String.join(",", cleaned));
        }

        if (req.getTheme() != null) {
            user.setTheme("light".equalsIgnoreCase(req.getTheme()) ? "light" : "dark");
        }

        userRepository.save(user);
        return ResponseEntity.ok(get(userId));
    }

    private List<String> parseSections(String stored) {
        if (stored == null || stored.isBlank()) return DEFAULT_SECTIONS;

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
