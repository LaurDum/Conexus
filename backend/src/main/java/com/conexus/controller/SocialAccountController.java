package com.conexus.controller;

import com.conexus.model.SocialAccount;
import com.conexus.security.CurrentUser;
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

    /** GET /api/socials — the signed-in user's linked accounts. */
    @GetMapping
    public List<SocialAccount> getAll(@CurrentUser Long userId) {
        return socialAccountService.getByUserId(userId);
    }

    /** POST /api/socials — link an account to the signed-in user. */
    @PostMapping
    public SocialAccount create(@CurrentUser Long userId, @RequestBody SocialAccount account) {
        // Ownership always comes from the token, never from the request body.
        account.setUserId(userId);

        if (account.getId() == null || account.getId().isBlank()) {
            account.setId("soc_" + UUID.randomUUID().toString().substring(0, 8));
        }
        return socialAccountService.save(account);
    }

    /** DELETE /api/socials/{id} — only the owner may remove it. */
    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@CurrentUser Long userId, @PathVariable String id) {
        if (!socialAccountService.isOwnedBy(id, userId)) {
            return ResponseEntity.status(403)
                    .body(Collections.singletonMap("message", "That account is not yours to remove"));
        }
        socialAccountService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
