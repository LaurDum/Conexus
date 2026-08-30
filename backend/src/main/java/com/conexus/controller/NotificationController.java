package com.conexus.controller;

import com.conexus.model.Notification;
import com.conexus.security.CurrentUser;
import com.conexus.service.NotificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final NotificationService notificationService;

    /** GET /api/notifications — the caller's 50 most recent, newest first. */
    @GetMapping
    public Map<String, Object> list(@CurrentUser Long userId) {
        List<Notification> items = notificationService.forUser(userId);
        return Map.of("items", items, "unread", notificationService.unreadCount(userId));
    }

    /** PUT /api/notifications/{id}/read */
    @PutMapping("/{id}/read")
    public ResponseEntity<Void> markRead(@CurrentUser Long userId, @PathVariable Long id) {
        notificationService.markRead(userId, id);
        return ResponseEntity.noContent().build();
    }

    /** PUT /api/notifications/read-all */
    @PutMapping("/read-all")
    public ResponseEntity<Void> markAllRead(@CurrentUser Long userId) {
        notificationService.markAllRead(userId);
        return ResponseEntity.noContent().build();
    }
}
