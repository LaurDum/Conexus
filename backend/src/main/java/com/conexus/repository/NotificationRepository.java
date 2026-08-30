package com.conexus.repository;

import com.conexus.model.Notification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface NotificationRepository extends JpaRepository<Notification, Long> {

    List<Notification> findTop50ByUserIdOrderByCreatedAtDesc(Long userId);

    long countByUserIdAndReadFalse(Long userId);

    List<Notification> findByUserIdAndReadFalse(Long userId);

    void deleteByPostId(Long postId);

    void deleteByCommentId(Long commentId);
}
