package com.conexus.repository;

import com.conexus.model.Connection;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ConnectionRepository extends JpaRepository<Connection, Long> {
    Optional<Connection> findByRequesterIdAndTargetCreatorId(Long requesterId, String targetCreatorId);
    void deleteByRequesterIdAndTargetCreatorId(Long requesterId, String targetCreatorId);
    List<Connection> findByRequesterId(Long requesterId);
}
