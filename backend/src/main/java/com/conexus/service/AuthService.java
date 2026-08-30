package com.conexus.service;

import com.conexus.dto.AuthDTOs;
import com.conexus.model.AuthToken;
import com.conexus.model.User;
import com.conexus.repository.AuthTokenRepository;
import com.conexus.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthService {

    private final UserRepository userRepository;
    private final AuthTokenRepository authTokenRepository;

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    /** How long a session lasts before the user has to sign in again. */
    private static final Duration TOKEN_LIFETIME = Duration.ofDays(30);

    @Transactional
    public AuthDTOs.AuthResponse register(AuthDTOs.RegisterRequest request) {
        if (request.getUsername() == null || request.getUsername().isBlank()) {
            throw new RuntimeException("Username is required");
        }
        if (request.getPassword() == null || request.getPassword().length() < 6) {
            throw new RuntimeException("Password must be at least 6 characters");
        }
        if (userRepository.existsByUsername(request.getUsername().toLowerCase().trim())) {
            throw new RuntimeException("Username is already taken");
        }
        if (userRepository.existsByEmail(request.getEmail().toLowerCase().trim())) {
            throw new RuntimeException("Email is already registered");
        }

        String initials = request.getDisplayName() != null && !request.getDisplayName().isEmpty()
            ? request.getDisplayName().substring(0, Math.min(2, request.getDisplayName().length())).toUpperCase()
            : request.getUsername().substring(0, 2).toUpperCase();

        User user = User.builder()
                .username(request.getUsername().toLowerCase().trim())
                .email(request.getEmail().toLowerCase().trim())
                .password(encoder.encode(request.getPassword()))
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
                .accountType("creator")
                .build();

        return respondWithNewToken(userRepository.save(user));
    }

    @Transactional
    public AuthDTOs.AuthResponse login(AuthDTOs.LoginRequest request) {
        String identifier = request.getUsernameOrEmail() == null
                ? "" : request.getUsernameOrEmail().toLowerCase().trim();

        User user = userRepository.findByUsernameOrEmail(identifier, identifier)
                .orElseThrow(() -> new RuntimeException("Invalid username/email or password"));

        if (!passwordMatches(user, request.getPassword())) {
            throw new RuntimeException("Invalid username/email or password");
        }

        return respondWithNewToken(user);
    }

    /**
     * Accepts the stored password whether it is a BCrypt hash or one of the
     * plain-text values written before hashing existed. A legacy password is
     * re-hashed on the spot, so accounts migrate as people sign in.
     */
    private boolean passwordMatches(User user, String submitted) {
        if (submitted == null) return false;
        String stored = user.getPassword();
        if (stored == null) return false;

        if (isBcryptHash(stored)) {
            return encoder.matches(submitted, stored);
        }

        if (!stored.equals(submitted)) return false;

        log.info("Upgrading legacy plain-text password for '{}' to BCrypt", user.getUsername());
        user.setPassword(encoder.encode(submitted));
        userRepository.save(user);
        return true;
    }

    /** Distinguishes an already-hashed password from a legacy plain-text one. */
    public static boolean isBcryptHash(String value) {
        return value != null && value.length() == 60
                && (value.startsWith("$2a$") || value.startsWith("$2b$") || value.startsWith("$2y$"));
    }

    /** Resolves a bearer token to its user, ignoring expired ones. */
    public Optional<User> authenticate(String token) {
        if (token == null || token.isBlank()) return Optional.empty();

        return authTokenRepository.findByToken(token)
                .filter(stored -> {
                    if (stored.isExpired()) {
                        authTokenRepository.delete(stored);
                        return false;
                    }
                    return true;
                })
                .flatMap(stored -> userRepository.findById(stored.getUserId()));
    }

    @Transactional
    public void logout(String token) {
        if (token != null && !token.isBlank()) {
            authTokenRepository.findByToken(token).ifPresent(authTokenRepository::delete);
        }
    }

    private AuthDTOs.AuthResponse respondWithNewToken(User user) {
        String token = UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", "");

        authTokenRepository.save(AuthToken.builder()
                .token(token)
                .userId(user.getId())
                .createdAt(Instant.now())
                .expiresAt(Instant.now().plus(TOKEN_LIFETIME))
                .build());

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
