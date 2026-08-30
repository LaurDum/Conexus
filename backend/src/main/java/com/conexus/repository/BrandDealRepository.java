package com.conexus.repository;

import com.conexus.model.BrandDeal;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface BrandDealRepository extends JpaRepository<BrandDeal, String> {

    /** The deal types actually present, for building the filter chips. */
    @Query("SELECT DISTINCT d.dealType FROM BrandDeal d ORDER BY d.dealType")
    List<String> findDistinctDealTypes();
}
