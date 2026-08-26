package com.conexus.controller;

import com.conexus.model.SocialAccount;
import com.conexus.service.SocialAccountService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/socials")
@RequiredArgsConstructor
public class SocialAccountController {

    private final SocialAccountService socialAccountService;

    /** GET /api/socials?userId=123 */
    @GetMapping
    public List<SocialAccount> getAll(@RequestParam(required = false) Long userId) {
        if (userId != null) {
            return socialAccountService.getByUserId(userId);
        }
        return socialAccountService.getAll();
    }

    /** POST /api/socials?userId=123 — add a social account */
    @PostMapping
    public ResponseEntity<?> create(@RequestParam(required = false) Long userId, @RequestBody SocialAccount account) {
        Long ownerId = userId != null ? userId : account.getUserId();
        // An account with no owner can never be read back by GET /api/socials?userId=…,
        // so reject it instead of writing an orphan row.
        if (ownerId == null) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "userId is required to add a social account"));
        }
        account.setUserId(ownerId);

        if (account.getId() == null || account.getId().isBlank()) {
            account.setId("soc_" + UUID.randomUUID().toString().substring(0, 8));
        }
        return ResponseEntity.ok(socialAccountService.save(account));
    }

    /** DELETE /api/socials/{id} */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        socialAccountService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
