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
        String username = request.getUsername() == null ? "" : request.getUsername().toLowerCase().trim();
        String email = request.getEmail() == null ? "" : request.getEmail().toLowerCase().trim();
        String displayName = request.getDisplayName() == null || request.getDisplayName().isBlank()
                ? username : request.getDisplayName().trim();

        if (!username.matches("[a-z0-9_.]{3,30}")) {
            throw new RuntimeException("Username must be 3–30 characters: letters, numbers, dots or underscores");
        }
        if (!email.matches("[^@\\s]+@[^@\\s]+\\.[^@\\s]+")) {
            throw new RuntimeException("Enter a valid email address");
        }
        if (request.getPassword() == null || request.getPassword().length() < 6) {
            throw new RuntimeException("Password must be at least 6 characters");
        }
        if (userRepository.existsByUsername(username)) {
            throw new RuntimeException("Username is already taken");
        }
        if (userRepository.existsByEmail(email)) {
            throw new RuntimeException("Email is already registered");
        }

        User user = User.builder()
                .username(username)
                .email(email)
                .password(encoder.encode(request.getPassword()))
                .displayName(displayName)
                .niche(request.getNiche() != null ? request.getNiche() : "Creator")
                .category("General")
                .location("Worldwide")
                .followers("0")
                .avatar(initialsOf(displayName))
                .bgClass("avatar-purple")
                .bio("Welcome to my Conexus profile!")
                // A brand new account has no audience. These used to be seeded
                // with "1K" and "5.0%", presenting invented numbers as real
                // metrics on the user's own profile.
                .totalReach("0")
                .engagement("0%")
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

    /** "Alex Popescu" → "AP", "laur" → "LA". */
    public static String initialsOf(String name) {
        String[] words = name.trim().split("\\s+");
        String initials = words.length > 1
                ? words[0].substring(0, 1) + words[1].substring(0, 1)
                : words[0].substring(0, Math.min(2, words[0].length()));
        return initials.toUpperCase();
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
