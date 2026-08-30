package com.conexus.controller;

import com.conexus.model.ChatThread;
import com.conexus.security.CurrentUser;
import com.conexus.service.ChatService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.List;

@RestController
@RequestMapping("/api/chats")
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;

    private static ResponseEntity<?> notYours() {
        return ResponseEntity.status(403)
                .body(Collections.singletonMap("message", "That conversation is not yours"));
    }

    /** GET /api/chats — the signed-in user's threads. */
    @GetMapping
    public List<ChatThread> getAll(@CurrentUser Long userId) {
        return chatService.getThreadsForUser(userId);
    }

    /** GET /api/chats/{id} — a single thread the caller owns. */
    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@CurrentUser Long userId, @PathVariable String id) {
        try {
            ChatThread thread = chatService.getThread(id);
            if (!chatService.isOwnedBy(thread, userId)) return notYours();
            return ResponseEntity.ok(thread);
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /** POST /api/chats/with-creator?creatorId=alex — open or reuse a conversation. */
    @PostMapping("/with-creator")
    public ResponseEntity<?> openWithCreator(@CurrentUser Long userId, @RequestParam String creatorId) {
        try {
            return ResponseEntity.ok(chatService.openThreadWithCreator(userId, creatorId));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", e.getMessage()));
        }
    }

    /** POST /api/chats/with-user?otherUserId=5 — open or reuse a direct conversation. */
    @PostMapping("/with-user")
    public ResponseEntity<?> openWithUser(@CurrentUser Long userId, @RequestParam Long otherUserId) {
        try {
            return ResponseEntity.ok(chatService.openThreadWithUser(userId, otherUserId));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", e.getMessage()));
        }
    }

    /** PUT /api/chats/{id}/read */
    @PutMapping("/{id}/read")
    public ResponseEntity<?> markRead(@CurrentUser Long userId, @PathVariable String id) {
        try {
            if (!chatService.isOwnedBy(chatService.getThread(id), userId)) return notYours();
            return ResponseEntity.ok(chatService.markRead(id));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", e.getMessage()));
        }
    }

    /** POST /api/chats/{id}/messages — send as the signed-in user. */
    @PostMapping("/{id}/messages")
    public ResponseEntity<?> sendMessage(@CurrentUser Long userId, @PathVariable String id,
                                         @RequestBody MessageRequest req) {
        if (req.getText() == null || req.getText().isBlank()) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "Message text is required"));
        }
        try {
            if (!chatService.isOwnedBy(chatService.getThread(id), userId)) return notYours();
            return ResponseEntity.ok(chatService.sendMessage(id, req.getText(), userId, req.getSender()));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", e.getMessage()));
        }
    }

    @Data
    static class MessageRequest {
        private String text;
        /** "me" (default) or "them" — used by the demo auto-reply. */
        private String sender;
    }
}
