package com.conexus.repository;

import com.conexus.model.ProfileInfo;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ProfileInfoRepository extends JpaRepository<ProfileInfo, Long> {
    Optional<ProfileInfo> findByUserId(Long userId);
}
