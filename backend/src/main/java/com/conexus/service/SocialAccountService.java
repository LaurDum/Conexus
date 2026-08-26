package com.conexus.service;

import com.conexus.model.SocialAccount;
import com.conexus.repository.SocialAccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class SocialAccountService {

    private final SocialAccountRepository socialAccountRepository;

    public List<SocialAccount> getAll() {
        return socialAccountRepository.findAll();
    }

    public List<SocialAccount> getByUserId(Long userId) {
        if (userId == null) return getAll();
        return socialAccountRepository.findByUserId(userId);
    }

    @Transactional
    public SocialAccount save(SocialAccount account) {
        return socialAccountRepository.save(account);
    }

    @Transactional
    public void delete(String id) {
        socialAccountRepository.deleteById(id);
    }
}
