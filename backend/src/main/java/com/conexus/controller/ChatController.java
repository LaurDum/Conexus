package com.conexus.controller;

import com.conexus.model.ChatThread;
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

    /** GET /api/chats?userId=123 */
    @GetMapping
    public List<ChatThread> getAll(@RequestParam(required = false) Long userId) {
        if (userId != null) {
            return chatService.getThreadsForUser(userId);
        }
        return chatService.getAllThreads();
    }

    /** GET /api/chats/{id} — single thread with messages */
    @GetMapping("/{id}")
    public ResponseEntity<ChatThread> getById(@PathVariable String id) {
        try {
            return ResponseEntity.ok(chatService.getThread(id));
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /** POST /api/chats — create a thread (idempotent: returns the existing one) */
    @PostMapping
    public ResponseEntity<?> createThread(@RequestBody ChatThread thread) {
        if (thread.getId() == null || thread.getId().isBlank()) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "Thread id is required"));
        }
        if (thread.getUserId() == null) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "userId is required"));
        }
        return ResponseEntity.ok(chatService.createOrGetThread(thread));
    }

    /**
     * POST /api/chats/with-creator?userId=1&creatorId=alex
     * Opens the caller's conversation with a creator card, reusing it if it
     * already exists. The thread id is derived server-side so both participants
     * agree on it.
     */
    @PostMapping("/with-creator")
    public ResponseEntity<?> openWithCreator(@RequestParam Long userId, @RequestParam String creatorId) {
        try {
            return ResponseEntity.ok(chatService.openThreadWithCreator(userId, creatorId));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", e.getMessage()));
        }
    }

    /** PUT /api/chats/{id}/read — mark thread as read */
    @PutMapping("/{id}/read")
    public ChatThread markRead(@PathVariable String id) {
        return chatService.markRead(id);
    }

    /** POST /api/chats/{id}/messages — send a message */
    @PostMapping("/{id}/messages")
    public ResponseEntity<?> sendMessage(@PathVariable String id, @RequestBody MessageRequest req) {
        if (req.getText() == null || req.getText().isBlank()) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "Message text is required"));
        }
        try {
            return ResponseEntity.ok(
                chatService.sendMessage(id, req.getText(), req.getSenderName(), req.getSenderId(), req.getSender()));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", e.getMessage()));
        }
    }

    @Data
    static class MessageRequest {
        private String text;
        private String senderName;
        private Long senderId;
        /** "me" (default) or "them" */
        private String sender;
    }
}
