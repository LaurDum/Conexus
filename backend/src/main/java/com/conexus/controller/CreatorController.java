package com.conexus.controller;

import com.conexus.model.Creator;
import com.conexus.service.CreatorService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

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

    /** POST /api/creators */
    @PostMapping
    public Creator create(@RequestBody Creator creator) {
        return creatorService.save(creator);
    }

    /** PUT /api/creators/{id} */
    @PutMapping("/{id}")
    public Creator update(@PathVariable String id, @RequestBody Creator creator) {
        creator.setId(id);
        return creatorService.save(creator);
    }

    /** DELETE /api/creators/{id} */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        creatorService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
