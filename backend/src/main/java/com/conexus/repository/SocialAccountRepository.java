package com.conexus.repository;

import com.conexus.model.SocialAccount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SocialAccountRepository extends JpaRepository<SocialAccount, String> {
    List<SocialAccount> findByUserId(Long userId);
}
