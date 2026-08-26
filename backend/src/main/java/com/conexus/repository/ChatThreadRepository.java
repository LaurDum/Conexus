package com.conexus.repository;

import com.conexus.model.ChatThread;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ChatThreadRepository extends JpaRepository<ChatThread, String> {
    List<ChatThread> findByUserId(Long userId);
}
