package com.conexus.service;

import com.conexus.dto.AuthDTOs;
import com.conexus.model.User;
import com.conexus.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;

    public AuthDTOs.AuthResponse register(AuthDTOs.RegisterRequest request) {
        if (userRepository.existsByUsername(request.getUsername())) {
            throw new RuntimeException("Username is already taken");
        }
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new RuntimeException("Email is already registered");
        }

        String initials = request.getDisplayName() != null && !request.getDisplayName().isEmpty() 
            ? request.getDisplayName().substring(0, Math.min(2, request.getDisplayName().length())).toUpperCase() 
            : request.getUsername().substring(0, 2).toUpperCase();

        User user = User.builder()
                .username(request.getUsername().toLowerCase().trim())
                .email(request.getEmail().toLowerCase().trim())
                .password(request.getPassword()) // Plain text for simplicity/demo
                .displayName(request.getDisplayName() != null ? request.getDisplayName() : request.getUsername())
                .niche(request.getNiche() != null ? request.getNiche() : "Creator")
                .category("General")
                .location("Worldwide")
                .followers("0")
                .avatar(initials)
                .bgClass("avatar-purple")
                .bio("Welcome to my Conexus profile!")
                .totalReach("1K")
                .engagement("5.0%")
                .build();

        User saved = userRepository.save(user);
        String token = UUID.randomUUID().toString();

        return new AuthDTOs.AuthResponse(
                saved.getId(),
                saved.getUsername(),
                saved.getEmail(),
                saved.getDisplayName(),
                saved.getNiche(),
                saved.getAvatar(),
                saved.getBgClass(),
                token,
                saved.getAccountType(),
                saved.isOnboardingComplete()
        );
    }

    public AuthDTOs.AuthResponse login(AuthDTOs.LoginRequest request) {
        String identifier = request.getUsernameOrEmail().toLowerCase().trim();
        User user = userRepository.findByUsernameOrEmail(identifier, identifier)
                .orElseThrow(() -> new RuntimeException("Invalid username/email or password"));

        if (!user.getPassword().equals(request.getPassword())) {
            throw new RuntimeException("Invalid username/email or password");
        }

        String token = UUID.randomUUID().toString();

        return new AuthDTOs.AuthResponse(
                user.getId(),
                user.getUsername(),
                user.getEmail(),
                user.getDisplayName(),
                user.getNiche(),
                user.getAvatar(),
                user.getBgClass(),
                token,
                user.getAccountType(),
                user.isOnboardingComplete()
        );
    }
}
