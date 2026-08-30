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
import com.conexus.service.ChatService;
import com.conexus.service.NotificationService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
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
    private final ChatService chatService;

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

            // Put it in the conversation too, so the request is somewhere they
            // will actually look rather than only behind the bell.
            chatService.postSystemMessage(userId, targetUserId,
                    displayNameOf(userId) + " sent a connection request.");
        }

        return ResponseEntity.ok(Map.of("status", saved.getStatus().equals(PENDING) ? "requested" : "connected",
                                        "id", saved.getId()));
    }

    /**
     * GET /api/connections/accepted — everyone the caller is connected with.
     *
     * A connection row is directional: one person asked, the other agreed. Both
     * of them are connected, so this looks in both directions and describes
     * whoever is on the other end.
     */
    @GetMapping("/accepted")
    public List<ConnectionView> accepted(@CurrentUser Long userId) {
        List<ConnectionView> out = new ArrayList<>();

        // Outgoing: ones this user asked for, accepted or still waiting.
        for (Connection c : connectionRepository.findByRequesterId(userId)) {
            ConnectionView v = describeOtherSide(c, c.getTargetUserId(), c.getTargetCreatorId());
            v.setStatus(c.getStatus() == null ? ACCEPTED : c.getStatus());
            v.setOutgoing(true);
            out.add(v);
        }

        // Incoming and already accepted — a pending one belongs in the requests
        // list, where it can be accepted or declined.
        for (Connection c : connectionRepository.findByTargetUserIdAndStatusOrderByCreatedAtDesc(userId, ACCEPTED)) {
            ConnectionView v = describeOtherSide(c, c.getRequesterId(), null);
            v.setStatus(ACCEPTED);
            v.setOutgoing(false);
            out.add(v);
        }

        // Connected first, then anything still waiting, each alphabetical.
        out.sort(Comparator.comparing((ConnectionView v) -> !ACCEPTED.equals(v.getStatus()))
                .thenComparing(ConnectionView::getName, String.CASE_INSENSITIVE_ORDER));
        return out;
    }

    /**
     * DELETE /api/connections/{id} — either side may remove a connection, and a
     * requester may withdraw one still pending.
     */
    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<?> remove(@CurrentUser Long userId, @PathVariable Long id) {
        Connection conn = connectionRepository.findById(id).orElse(null);
        if (conn == null) return ResponseEntity.noContent().build();

        boolean mine = userId.equals(conn.getRequesterId()) || userId.equals(conn.getTargetUserId());
        if (!mine) {
            return ResponseEntity.status(403)
                    .body(Collections.singletonMap("message", "That connection is not yours"));
        }

        // Removed quietly, the same way declining is.
        connectionRepository.delete(conn);
        return ResponseEntity.noContent().build();
    }

    /** Describes whoever is on the other end of a connection from the caller. */
    private ConnectionView describeOtherSide(Connection conn, Long otherUserId, String creatorId) {
        ConnectionView v = new ConnectionView();
        v.setId(conn.getId());
        v.setUserId(otherUserId);
        v.setCreatorId(conn.getTargetCreatorId());
        v.setSince(conn.getCreatedAt());

        if (otherUserId != null) {
            User other = userRepository.findById(otherUserId).orElse(null);
            v.setName(other == null ? "Someone" : displayNameOf(otherUserId));
            v.setAvatar(other != null ? other.getAvatar() : "?");
            v.setBgClass(other != null ? other.getBgClass() : "avatar-purple");
            v.setNiche(other != null ? other.getNiche() : "Conexus Creator");
            return v;
        }

        // A discover card nobody has claimed — a one way follow.
        Creator card = creatorId == null ? null : creatorRepository.findById(creatorId).orElse(null);
        v.setName(card != null ? card.getName() : "Creator");
        v.setAvatar(card != null ? card.getAvatar() : "?");
        v.setBgClass(card != null ? card.getBgClass() : "avatar-purple");
        v.setNiche(card != null ? card.getNiche() : "Conexus Creator");
        return v;
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

        chatService.postSystemMessage(userId, conn.getRequesterId(),
                displayNameOf(userId) + " accepted the connection request. You're connected.");

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

    /** The name someone is known by, preferring their profile. */
    private String displayNameOf(Long userId) {
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) return "Someone";

        return profileInfoRepository.findByUserId(userId)
                .map(ProfileInfo::getDisplayName)
                .filter(n -> n != null && !n.isBlank())
                .orElseGet(() -> user.getDisplayName() != null ? user.getDisplayName() : user.getUsername());
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
    public static class ConnectionView {
        private Long id;
        private Long userId;
        private String creatorId;
        private String name;
        private String avatar;
        private String bgClass;
        private String niche;
        private String status;
        /** True when this user sent the request, so they can withdraw it. */
        private boolean outgoing;
        private java.time.Instant since;
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
