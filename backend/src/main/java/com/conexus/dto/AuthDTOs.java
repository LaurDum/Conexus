package com.conexus.dto;

import lombok.Data;

public class AuthDTOs {

    @Data
    public static class RegisterRequest {
        private String username;
        private String email;
        private String password;
        private String displayName;
        private String niche;
    }

    @Data
    public static class LoginRequest {
        private String usernameOrEmail;
        private String password;
    }

    @Data
    public static class AuthResponse {
        private Long id;
        private String username;
        private String email;
        private String displayName;
        private String niche;
        private String avatar;
        private String bgClass;
        private String token;
        private String accountType;
        private boolean onboardingComplete;

        public AuthResponse(Long id, String username, String email, String displayName, String niche, String avatar, String bgClass, String token, String accountType, boolean onboardingComplete) {
            this.id = id;
            this.username = username;
            this.email = email;
            this.displayName = displayName;
            this.niche = niche;
            this.avatar = avatar;
            this.bgClass = bgClass;
            this.token = token;
            this.accountType = accountType;
            this.onboardingComplete = onboardingComplete;
        }
    }

    @Data
    public static class OnboardingRequest {
        private Long userId;
        private String accountType; // "creator" or "business"
        private String goals;
        private String bio;
        private String location;
        private java.util.List<SocialAccountDTO> socials;
    }

    @Data
    public static class SocialAccountDTO {
        private String platform;
        private String handle;
        private String url;
        private String followers;
    }
}
