package com.conexus.auth;

import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.util.Collections;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final LoginThrottle loginThrottle;

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody AuthDTOs.RegisterRequest request) {
        try {
            return ResponseEntity.ok(authService.register(request));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", e.getMessage()));
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody AuthDTOs.LoginRequest request, HttpServletRequest http) {
        String identifier = request.getUsernameOrEmail() == null
                ? "" : request.getUsernameOrEmail().toLowerCase().trim();
        String address = http.getRemoteAddr();

        long wait = loginThrottle.minutesLocked(identifier, address);
        if (wait > 0) {
            return ResponseEntity.status(429).body(Collections.singletonMap("message",
                    "Too many attempts. Try again in " + wait + " minute" + (wait == 1 ? "" : "s") + "."));
        }

        try {
            AuthDTOs.AuthResponse response = authService.login(request);
            loginThrottle.recordSuccess(identifier);
            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            loginThrottle.recordFailure(identifier, address);
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", e.getMessage()));
        }
    }

    /** POST /api/auth/logout — invalidates the caller's token server-side. */
    @PostMapping("/logout")
    public ResponseEntity<?> logout(HttpServletRequest request) {
        authService.logout(AuthInterceptor.bearerToken(request));
        return ResponseEntity.noContent().build();
    }

    /** POST /api/auth/logout-others — ends every session except this one. */
    @PostMapping("/logout-others")
    public Map<String, Object> logoutOthers(@CurrentUser Long userId, HttpServletRequest request) {
        int ended = authService.signOutEverywhereElse(userId, AuthInterceptor.bearerToken(request));
        return Map.of("ended", ended);
    }

    /** POST /api/auth/password — change the password; other sessions are signed out. */
    @PostMapping("/password")
    public ResponseEntity<?> changePassword(@CurrentUser Long userId, @RequestBody PasswordChange req,
                                            HttpServletRequest request) {
        try {
            authService.changePassword(userId, req.getCurrentPassword(), req.getNewPassword(),
                    AuthInterceptor.bearerToken(request));
            return ResponseEntity.noContent().build();
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", e.getMessage()));
        }
    }

    @Data
    static class PasswordChange {
        private String currentPassword;
        private String newPassword;
    }
}
