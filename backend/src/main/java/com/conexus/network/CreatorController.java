package com.conexus.network;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The creator catalog, read-only: it is seeded at startup and shared by
 * everyone, so no single account may rewrite or delete it.
 */
@RestController
@RequestMapping("/api/creators")
@RequiredArgsConstructor
public class CreatorController {

    private final CreatorRepository creatorRepository;

    /** GET /api/creators — every catalog card, with its match score. */
    @GetMapping
    public List<Creator> getAll() {
        return creatorRepository.findAll();
    }
}
