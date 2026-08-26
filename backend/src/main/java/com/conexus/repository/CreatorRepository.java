package com.conexus.repository;

import com.conexus.model.Creator;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CreatorRepository extends JpaRepository<Creator, String> {

    List<Creator> findByCategory(String category);

    List<Creator> findByNameContainingIgnoreCase(String name);
}
