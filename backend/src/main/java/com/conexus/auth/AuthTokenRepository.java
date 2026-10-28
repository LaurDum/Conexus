package com.conexus.auth;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface AuthTokenRepository extends JpaRepository<AuthToken, String> {

    Optional<AuthToken> findByToken(String token);

    List<AuthToken> findByUserId(Long userId);

    void deleteByUserId(Long userId);

    void deleteByExpiresAtBefore(Instant cutoff);
}
