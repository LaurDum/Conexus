package com.conexus.repository;

import com.conexus.model.PostLike;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PostLikeRepository extends JpaRepository<PostLike, Long> {

    Optional<PostLike> findByPostIdAndUserId(Long postId, Long userId);

    long countByPostId(Long postId);

    /** The post IDs this user has liked — one query for a whole feed render. */
    @Query("SELECT l.postId FROM PostLike l WHERE l.userId = :userId")
    List<Long> findPostIdsLikedBy(Long userId);
}
