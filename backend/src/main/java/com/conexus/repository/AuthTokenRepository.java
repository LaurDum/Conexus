package com.conexus.repository;

import com.conexus.model.AuthToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;

@Repository
public interface AuthTokenRepository extends JpaRepository<AuthToken, String> {

    Optional<AuthToken> findByToken(String token);

    void deleteByUserId(Long userId);

    void deleteByExpiresAtBefore(Instant cutoff);
}
