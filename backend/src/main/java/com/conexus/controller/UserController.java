package com.conexus.controller;

import com.conexus.dto.PublicProfile;
import com.conexus.model.Connection;
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
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

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
     * GET /api/users?search=&category=&page=0&size=10
     *
     * Everyone on Conexus except the caller, a page at a time. Discover used to
     * list the creators catalog, which was mostly rows with no account behind
     * them — you could not really connect with or message any of them.
     */
    @GetMapping
    public Map<String, Object> browse(@CurrentUser Long callerId,
                                      @RequestParam(required = false) String search,
                                      @RequestParam(required = false) String category,
                                      @RequestParam(defaultValue = "0") int page,
                                      @RequestParam(defaultValue = "10") int size) {

        String needle = search == null ? "" : search.trim().toLowerCase();
        String wantedCategory = category == null || category.isBlank() || "all".equalsIgnoreCase(category)
                ? null : category.trim();

        List<Creator> creators = creatorRepository.findAll();

        // A connection is keyed by creator card when there is one and by account
        // otherwise, so both have to be consulted — checking only the card left
        // cardless accounts always showing as not connected.
        List<Connection> myConnections = connectionRepository.findByRequesterId(callerId);
        Set<String> connectedCards = myConnections.stream()
                .map(Connection::getTargetCreatorId)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, String> connectedAccounts = myConnections.stream()
                .filter(c -> c.getTargetUserId() != null)
                .collect(Collectors.toMap(Connection::getTargetUserId,
                        c -> c.getStatus() == null ? "ACCEPTED" : c.getStatus(),
                        (a, b) -> a));

        List<Map<String, Object>> all = userRepository.findAll().stream()
                .filter(u -> !u.getId().equals(callerId))
                .map(u -> summarise(u, creators, connectedCards, connectedAccounts))
                .filter(card -> wantedCategory == null
                        || wantedCategory.equalsIgnoreCase(String.valueOf(card.get("category"))))
                .filter(card -> needle.isEmpty()
                        || String.valueOf(card.get("name")).toLowerCase().contains(needle)
                        || String.valueOf(card.get("niche")).toLowerCase().contains(needle)
                        || String.valueOf(card.get("location")).toLowerCase().contains(needle))
                .sorted(Comparator.comparingInt((Map<String, Object> c) -> (int) c.get("match")).reversed())
                .collect(Collectors.toList());

        int from = Math.max(0, page * size);
        int to = Math.min(all.size(), from + size);
        List<Map<String, Object>> pageItems = from >= all.size() ? List.of() : all.subList(from, to);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", pageItems);
        result.put("page", page);
        result.put("total", all.size());
        result.put("hasMore", to < all.size());
        return result;
    }

    /** The card-sized view of an account used by Discover. */
    private Map<String, Object> summarise(User u, List<Creator> creators,
                                          Set<String> connectedCards, Map<Long, String> connectedAccounts) {
        Creator card = creators.stream().filter(c -> u.getId().equals(c.getUserId())).findFirst().orElse(null);

        ProfileInfo info = profileInfoRepository.findByUserId(u.getId()).orElse(null);
        String name = info != null && info.getDisplayName() != null && !info.getDisplayName().isBlank()
                ? info.getDisplayName()
                : (u.getDisplayName() != null ? u.getDisplayName() : u.getUsername());

        Map<String, Object> m = new LinkedHashMap<>();
        m.put("userId", u.getId());
        m.put("id", card != null ? card.getId() : null);
        m.put("name", name);
        m.put("niche", u.getNiche() != null ? u.getNiche() : "Creator");
        m.put("category", u.getCategory() != null ? u.getCategory() : "General");
        m.put("location", info != null && info.getLocation() != null ? info.getLocation()
                : (u.getLocation() != null ? u.getLocation() : "Worldwide"));
        m.put("followers", info != null && info.getTotalReach() != null ? info.getTotalReach()
                : (u.getTotalReach() != null ? u.getTotalReach() : "0"));
        m.put("avatar", u.getAvatar() != null ? u.getAvatar() : name.substring(0, Math.min(2, name.length())).toUpperCase());
        m.put("bgClass", u.getBgClass() != null ? u.getBgClass() : "avatar-purple");
        // The catalog card carries the curated match score; otherwise show none.
        m.put("match", card != null ? card.getMatchScore() : 0);
        boolean isConnected = (card != null && connectedCards.contains(card.getId()))
                || connectedAccounts.containsKey(u.getId());
        m.put("connected", isConnected);
        m.put("status", connectedAccounts.getOrDefault(u.getId(), isConnected ? "ACCEPTED" : null));
        return m;
    }

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
