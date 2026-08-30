package com.conexus.repository;

import com.conexus.model.CommentLike;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CommentLikeRepository extends JpaRepository<CommentLike, Long> {

    Optional<CommentLike> findByCommentIdAndUserId(Long commentId, Long userId);

    long countByCommentId(Long commentId);

    void deleteByCommentId(Long commentId);

    /** Comment IDs this user has liked — one query for a whole thread. */
    @Query("SELECT l.commentId FROM CommentLike l WHERE l.userId = :userId")
    List<Long> findCommentIdsLikedBy(Long userId);
}
