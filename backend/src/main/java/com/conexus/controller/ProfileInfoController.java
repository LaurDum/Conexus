package com.conexus.controller;

import com.conexus.model.ProfileInfo;
import com.conexus.service.ProfileInfoService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;

@RestController
@RequestMapping("/api/profile")
@RequiredArgsConstructor
public class ProfileInfoController {

    private final ProfileInfoService profileInfoService;

    /** GET /api/profile?userId=123 */
    @GetMapping
    public ProfileInfo get(@RequestParam(required = false) Long userId) {
        return profileInfoService.getByUserId(userId);
    }

    /** PUT /api/profile?userId=123 */
    @PutMapping
    public ResponseEntity<?> update(@RequestParam(required = false) Long userId, @RequestBody ProfileInfo profileInfo) {
        Long targetId = userId != null ? userId : profileInfo.getUserId();
        try {
            return ResponseEntity.ok(profileInfoService.update(targetId, profileInfo));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", e.getMessage()));
        }
    }
}
