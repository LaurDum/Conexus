package com.conexus.controller;

import com.conexus.model.Creator;
import com.conexus.service.CreatorService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * The creator catalog is read-only over the API: it is seeded by DataSeeder and
 * shared by everyone, so no single account may rewrite or delete it.
 */
@RestController
@RequestMapping("/api/creators")
@RequiredArgsConstructor
public class CreatorController {

    private final CreatorService creatorService;

    /** GET /api/creators — all creators (optionally filter by category or search name) */
    @GetMapping
    public List<Creator> getAll(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String search) {

        if (search != null && !search.isBlank()) {
            return creatorService.search(search);
        }
        if (category != null && !category.isBlank()) {
            return creatorService.getByCategory(category);
        }
        return creatorService.getAll();
    }

    /** GET /api/creators/{id} */
    @GetMapping("/{id}")
    public ResponseEntity<Creator> getById(@PathVariable String id) {
        try {
            return ResponseEntity.ok(creatorService.getById(id));
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
