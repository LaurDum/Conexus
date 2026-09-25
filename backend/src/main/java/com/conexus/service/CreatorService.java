package com.conexus.service;

import com.conexus.model.Creator;
import com.conexus.repository.CreatorRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class CreatorService {

    private final CreatorRepository creatorRepository;

    public List<Creator> getAll() {
        return creatorRepository.findAll();
    }

    public Creator getById(String id) {
        return creatorRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Creator not found: " + id));
    }

    public List<Creator> getByCategory(String category) {
        return creatorRepository.findByCategory(category);
    }

    public List<Creator> search(String name) {
        return creatorRepository.findByNameContainingIgnoreCase(name);
    }
}
