package com.conexus.controller;

import com.conexus.model.Connection;
import com.conexus.model.Creator;
import com.conexus.model.Notification;
import com.conexus.model.ProfileInfo;
import com.conexus.model.User;
import com.conexus.repository.ConnectionRepository;
import com.conexus.repository.CreatorRepository;
import com.conexus.repository.ProfileInfoRepository;
import com.conexus.repository.UserRepository;
import com.conexus.security.CurrentUser;
import com.conexus.service.NotificationService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/connections")
@RequiredArgsConstructor
public class ConnectionController {

    public static final String PENDING = "PENDING";
    public static final String ACCEPTED = "ACCEPTED";

    private final ConnectionRepository connectionRepository;
    private final CreatorRepository creatorRepository;
    private final UserRepository userRepository;
    private final ProfileInfoRepository profileInfoRepository;
    private final NotificationService notificationService;

    /** GET /api/connections — creator IDs the caller has connected with, and their state. */
    @GetMapping
    public List<Map<String, String>> getConnections(@CurrentUser Long userId) {
        return connectionRepository.findByRequesterId(userId).stream()
                .map(c -> {
                    Map<String, String> m = new java.util.LinkedHashMap<>();
                    m.put("creatorId", c.getTargetCreatorId());
                    m.put("targetUserId", c.getTargetUserId() == null ? null : String.valueOf(c.getTargetUserId()));
                    m.put("status", c.getStatus() == null ? ACCEPTED : c.getStatus());
                    return m;
                })
                .collect(Collectors.toList());
    }

    /**
     * POST /api/connections/toggle — request a connection, or withdraw one.
     *
     * A card with an account behind it becomes a request that person can accept.
     * A demo card with nobody behind it is accepted immediately, since there is
     * no one who could ever respond.
     */
    @PostMapping("/toggle")
    @Transactional
    public ResponseEntity<?> toggleConnection(@CurrentUser Long userId, @RequestBody Connection req) {
        // Identified by creator card where there is one, otherwise by account —
        // most people on Discover have no catalog card.
        if (req.getTargetCreatorId() == null && req.getTargetUserId() == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Missing targetCreatorId or targetUserId"));
        }

        var existing = req.getTargetCreatorId() != null
                ? connectionRepository.findByRequesterIdAndTargetCreatorId(userId, req.getTargetCreatorId())
                : connectionRepository.findByRequesterIdAndTargetUserId(userId, req.getTargetUserId());

        if (existing.isPresent()) {
            connectionRepository.delete(existing.get());
            return ResponseEntity.ok(Map.of("status", "disconnected"));
        }

        Creator creator = req.getTargetCreatorId() != null
                ? creatorRepository.findById(req.getTargetCreatorId()).orElse(null)
                : null;
        Long targetUserId = creator != null ? creator.getUserId() : req.getTargetUserId();

        if (targetUserId != null && targetUserId.equals(userId)) {
            return ResponseEntity.badRequest().body(Map.of("error", "You cannot connect with yourself"));
        }

        Connection saved = connectionRepository.save(Connection.builder()
                .requesterId(userId)
                .targetCreatorId(req.getTargetCreatorId())
                .targetUserId(targetUserId)
                .status(targetUserId != null ? PENDING : ACCEPTED)
                .build());

        if (targetUserId != null) {
            notificationService.notify(targetUserId, userId, NotificationService.CONNECTION,
                    Notification.builder().excerpt("wants to connect with you"));
        }

        return ResponseEntity.ok(Map.of("status", saved.getStatus().equals(PENDING) ? "requested" : "connected",
                                        "id", saved.getId()));
    }

    /** GET /api/connections/requests — requests waiting on the caller. */
    @GetMapping("/requests")
    public List<RequestView> incoming(@CurrentUser Long userId) {
        return connectionRepository.findByTargetUserIdAndStatusOrderByCreatedAtDesc(userId, PENDING).stream()
                .map(this::describe)
                .collect(Collectors.toList());
    }

    /** PUT /api/connections/{id}/accept */
    @PutMapping("/{id}/accept")
    @Transactional
    public ResponseEntity<?> accept(@CurrentUser Long userId, @PathVariable Long id) {
        Connection conn = connectionRepository.findById(id).orElse(null);
        if (conn == null || !userId.equals(conn.getTargetUserId())) {
            return ResponseEntity.status(403).body(Collections.singletonMap("message", "That request is not yours"));
        }

        conn.setStatus(ACCEPTED);
        connectionRepository.save(conn);

        notificationService.notify(conn.getRequesterId(), userId, NotificationService.CONNECTION,
                Notification.builder().excerpt("accepted your connection request"));

        return ResponseEntity.ok(Map.of("status", ACCEPTED));
    }

    /** PUT /api/connections/{id}/decline — removes it quietly. */
    @PutMapping("/{id}/decline")
    @Transactional
    public ResponseEntity<?> decline(@CurrentUser Long userId, @PathVariable Long id) {
        Connection conn = connectionRepository.findById(id).orElse(null);
        if (conn == null || !userId.equals(conn.getTargetUserId())) {
            return ResponseEntity.status(403).body(Collections.singletonMap("message", "That request is not yours"));
        }
        // No notification: being turned down does not need announcing.
        connectionRepository.delete(conn);
        return ResponseEntity.noContent().build();
    }

    private RequestView describe(Connection conn) {
        User requester = userRepository.findById(conn.getRequesterId()).orElse(null);
        String name = requester == null ? "Someone"
                : profileInfoRepository.findByUserId(requester.getId())
                    .map(ProfileInfo::getDisplayName)
                    .filter(n -> n != null && !n.isBlank())
                    .orElseGet(() -> requester.getDisplayName() != null ? requester.getDisplayName() : requester.getUsername());

        RequestView v = new RequestView();
        v.setId(conn.getId());
        v.setRequesterId(conn.getRequesterId());
        v.setName(name);
        v.setAvatar(requester != null ? requester.getAvatar() : "?");
        v.setBgClass(requester != null ? requester.getBgClass() : "avatar-purple");
        v.setNiche(requester != null ? requester.getNiche() : "Conexus Creator");
        return v;
    }

    @Data
    public static class RequestView {
        private Long id;
        private Long requesterId;
        private String name;
        private String avatar;
        private String bgClass;
        private String niche;
    }
}
