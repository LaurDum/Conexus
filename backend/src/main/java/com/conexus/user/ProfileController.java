package com.conexus.user;

import com.conexus.auth.CurrentUser;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/** The signed-in user's own profile: what they see on their Profile tab and can edit. */
@RestController
@RequestMapping("/api/profile")
@RequiredArgsConstructor
public class ProfileController {

    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<?> get(@CurrentUser Long userId) {
        return userRepository.findById(userId)
                .<ResponseEntity<?>>map(user -> ResponseEntity.ok(view(user)))
                .orElse(ResponseEntity.status(401).body(Collections.singletonMap("message", "Sign in to continue")));
    }

    @PutMapping
    @Transactional
    public ResponseEntity<?> update(@CurrentUser Long userId, @RequestBody ProfileUpdate req) {
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) {
            return ResponseEntity.status(401).body(Collections.singletonMap("message", "Sign in to continue"));
        }

        String name = req.getDisplayName() == null ? null : req.getDisplayName().trim();
        String bio = req.getBio() == null ? null : req.getBio().trim();
        String location = req.getLocation() == null ? null : req.getLocation().trim();
        String handle = req.getHandle() == null ? null : req.getHandle().trim().replaceFirst("^@", "").toLowerCase();

        if (name != null && name.length() > 50) return invalid("Keep your name under 50 characters");
        if (bio != null && bio.length() > 300) return invalid("Keep your bio under 300 characters");
        if (location != null && location.length() > 60) return invalid("Keep your location under 60 characters");
        if (handle != null && !handle.isEmpty()) {
            if (!handle.matches("[a-z0-9_.]{2,30}")) {
                return invalid("Handles are 2–30 letters, numbers, dots or underscores");
            }
            // Someone else's handle would let you pass as them.
            boolean taken = userRepository.findAll().stream().anyMatch(u -> !u.getId().equals(userId)
                    && (("@" + handle).equalsIgnoreCase(u.publicHandle()) || handle.equalsIgnoreCase(u.getUsername())));
            if (taken) return invalid("@" + handle + " is already taken");
        }

        // A blank name would leave the byline empty everywhere it is shown.
        if (name != null && !name.isEmpty()) user.setDisplayName(name);
        if (handle != null && !handle.isEmpty()) user.setHandle("@" + handle);
        if (bio != null) user.setBio(bio);
        if (location != null) user.setLocation(location);
        // Reach and engagement are shown to other people as metrics, so they
        // are not something a profile edit can type in.

        return ResponseEntity.ok(view(userRepository.save(user)));
    }

    private static Map<String, Object> view(User user) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("displayName", user.publicName());
        m.put("handle", user.publicHandle());
        m.put("bio", user.getBio());
        m.put("location", user.getLocation());
        m.put("totalReach", user.getTotalReach() != null ? user.getTotalReach() : "0");
        m.put("engagement", user.getEngagement() != null ? user.getEngagement() : "0%");
        return m;
    }

    @Data
    public static class ProfileUpdate {
        private String displayName;
        private String handle;
        private String bio;
        private String location;
    }

    private static ResponseEntity<?> invalid(String message) {
        return ResponseEntity.badRequest().body(Collections.singletonMap("message", message));
    }
}
