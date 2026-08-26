package com.conexus.controller;

import com.conexus.model.Connection;
import com.conexus.repository.ConnectionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/connections")
@RequiredArgsConstructor
public class ConnectionController {

    private final ConnectionRepository connectionRepository;

    /**
     * GET /api/connections?requesterId=123
     * Returns the creator IDs this user has already connected with, so the UI
     * can restore the "Requested" state of connect buttons after a reload.
     */
    @GetMapping
    public List<String> getConnections(@RequestParam Long requesterId) {
        return connectionRepository.findByRequesterId(requesterId).stream()
                .map(Connection::getTargetCreatorId)
                .collect(Collectors.toList());
    }

    @PostMapping("/toggle")
    @Transactional
    public ResponseEntity<?> toggleConnection(@RequestBody Connection req) {
        if (req.getRequesterId() == null || req.getTargetCreatorId() == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Missing requesterId or targetCreatorId"));
        }

        var existing = connectionRepository.findByRequesterIdAndTargetCreatorId(req.getRequesterId(), req.getTargetCreatorId());
        
        if (existing.isPresent()) {
            connectionRepository.deleteByRequesterIdAndTargetCreatorId(req.getRequesterId(), req.getTargetCreatorId());
            return ResponseEntity.ok(Map.of("status", "disconnected"));
        } else {
            Connection saved = connectionRepository.save(req);
            return ResponseEntity.ok(Map.of("status", "connected", "id", saved.getId()));
        }
    }
}
