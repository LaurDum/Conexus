package com.conexus.repository;

import com.conexus.model.Job;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface JobRepository extends JpaRepository<Job, String> {

    /** The job types actually present, for the filter chips. */
    @Query("SELECT DISTINCT j.jobType FROM Job j ORDER BY j.jobType")
    List<String> findDistinctJobTypes();
}
