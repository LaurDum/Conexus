package com.conexus.controller;

import com.conexus.model.Connection;
import com.conexus.model.Notification;
import com.conexus.repository.ConnectionRepository;
import com.conexus.repository.CreatorRepository;
import com.conexus.service.NotificationService;
import com.conexus.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/connections")
@RequiredArgsConstructor
public class ConnectionController {

    private final ConnectionRepository connectionRepository;
    private final CreatorRepository creatorRepository;
    private final NotificationService notificationService;

    /** GET /api/connections — creator IDs the signed-in user has connected with. */
    @GetMapping
    public List<String> getConnections(@CurrentUser Long userId) {
        return connectionRepository.findByRequesterId(userId).stream()
                .map(Connection::getTargetCreatorId)
                .collect(Collectors.toList());
    }

    /** POST /api/connections/toggle — connect or disconnect, always as the caller. */
    @PostMapping("/toggle")
    @Transactional
    public ResponseEntity<?> toggleConnection(@CurrentUser Long userId, @RequestBody Connection req) {
        if (req.getTargetCreatorId() == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Missing targetCreatorId"));
        }

        // requesterId from the body is ignored — it would let anyone create
        // connections on another account's behalf.
        var existing = connectionRepository.findByRequesterIdAndTargetCreatorId(userId, req.getTargetCreatorId());

        if (existing.isPresent()) {
            connectionRepository.deleteByRequesterIdAndTargetCreatorId(userId, req.getTargetCreatorId());
            return ResponseEntity.ok(Map.of("status", "disconnected"));
        }

        req.setId(null);
        req.setRequesterId(userId);
        Connection saved = connectionRepository.save(req);

        // Tell the person behind the card, when there is one.
        creatorRepository.findById(req.getTargetCreatorId()).ifPresent(creator ->
                notificationService.notify(creator.getUserId(), userId, NotificationService.CONNECTION,
                        Notification.builder()));

        return ResponseEntity.ok(Map.of("status", "connected", "id", saved.getId()));
    }
}
