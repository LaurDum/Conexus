package com.conexus.repository;

import com.conexus.model.PostImage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface PostImageRepository extends JpaRepository<PostImage, Long> {

    Optional<PostImage> findByPostId(Long postId);

    void deleteByPostId(Long postId);
}
