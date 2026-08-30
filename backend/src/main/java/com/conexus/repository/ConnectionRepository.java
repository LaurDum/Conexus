package com.conexus.repository;

import com.conexus.model.Connection;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ConnectionRepository extends JpaRepository<Connection, Long> {
    Optional<Connection> findByRequesterIdAndTargetCreatorId(Long requesterId, String targetCreatorId);
    void deleteByRequesterIdAndTargetCreatorId(Long requesterId, String targetCreatorId);
    List<Connection> findByRequesterId(Long requesterId);

    /** For accounts that have no creator card to key off. */
    Optional<Connection> findByRequesterIdAndTargetUserId(Long requesterId, Long targetUserId);

    /** Requests waiting on this user. */
    List<Connection> findByTargetUserIdAndStatusOrderByCreatedAtDesc(Long targetUserId, String status);

    long countByTargetUserIdAndStatus(Long targetUserId, String status);

    List<Connection> findByRequesterIdAndStatus(Long requesterId, String status);
}
