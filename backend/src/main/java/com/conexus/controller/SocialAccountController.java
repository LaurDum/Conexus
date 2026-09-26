package com.conexus.controller;

import com.conexus.model.SocialAccount;
import com.conexus.security.CurrentUser;
import com.conexus.service.ReachService;
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
    private final ReachService reachService;

    /** GET /api/socials — the signed-in user's linked accounts. */
    @GetMapping
    public List<SocialAccount> getAll(@CurrentUser Long userId) {
        // A visit is a good moment to note today's reach, so the history has
        // a point for every day someone uses the app.
        reachService.record(userId);
        return socialAccountService.getByUserId(userId);
    }

    /**
     * POST /api/socials — add a link, or update one by passing its existing id.
     *
     * Saving with an id that already exists overwrites that row, so a request
     * naming someone else's id would otherwise hand it to the caller.
     */
    @PostMapping
    public ResponseEntity<?> create(@CurrentUser Long userId, @RequestBody SocialAccount account) {
        boolean isUpdate = account.getId() != null && !account.getId().isBlank();

        if (isUpdate && socialAccountService.exists(account.getId())
                && !socialAccountService.isOwnedBy(account.getId(), userId)) {
            return ResponseEntity.status(403)
                    .body(Collections.singletonMap("message", "That account is not yours to edit"));
        }

        if (!SocialAccountService.isKnownPlatform(account.getPlatform())) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "Pick a platform from the list"));
        }
        if (account.getHandle() == null || account.getHandle().isBlank()) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "Add your handle or channel name"));
        }
        String url = SocialAccountService.normalizeUrl(account.getUrl());
        if (url == null) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "Enter a web address starting with https://"));
        }
        account.setUrl(url);
        account.setHandle(account.getHandle().trim());
        SocialAccountService.applyPlatformMeta(account);

        // Ownership always comes from the token, never from the request body.
        account.setUserId(userId);

        if (!isUpdate) {
            account.setId("soc_" + UUID.randomUUID().toString().substring(0, 8));
        }
        SocialAccount saved = socialAccountService.save(account);
        reachService.record(userId);
        return ResponseEntity.ok(saved);
    }

    /** DELETE /api/socials/{id} — only the owner may remove it. */
    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@CurrentUser Long userId, @PathVariable String id) {
        if (!socialAccountService.isOwnedBy(id, userId)) {
            return ResponseEntity.status(403)
                    .body(Collections.singletonMap("message", "That account is not yours to remove"));
        }
        socialAccountService.delete(id);
        reachService.record(userId);
        return ResponseEntity.noContent().build();
    }
}
