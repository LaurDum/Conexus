package com.conexus.controller;

import com.conexus.model.ProfileInfo;
import com.conexus.security.CurrentUser;
import com.conexus.service.ProfileInfoService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/profile")
@RequiredArgsConstructor
public class ProfileInfoController {

    private final ProfileInfoService profileInfoService;

    /**
     * GET /api/profile — the signed-in user's profile.
     *
     * The old ?userId= parameter is gone: it let anyone read any profile just by
     * changing the number.
     */
    @GetMapping
    public ProfileInfo get(@CurrentUser Long userId) {
        return profileInfoService.getByUserId(userId);
    }

    /** PUT /api/profile — updates the signed-in user's own profile. */
    @PutMapping
    public ProfileInfo update(@CurrentUser Long userId, @RequestBody ProfileInfo profileInfo) {
        return profileInfoService.update(userId, profileInfo);
    }
}
