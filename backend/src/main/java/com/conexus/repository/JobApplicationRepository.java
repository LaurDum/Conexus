package com.conexus.repository;

import com.conexus.model.JobApplication;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface JobApplicationRepository extends JpaRepository<JobApplication, Long> {

    Optional<JobApplication> findByJobIdAndApplicantUserId(String jobId, Long applicantUserId);

    List<JobApplication> findByJobIdOrderByCreatedAtDesc(String jobId);

    long countByJobId(String jobId);

    void deleteByJobId(String jobId);

    /** Listings this user has applied to — one query for a whole page. */
    @Query("SELECT a.jobId FROM JobApplication a WHERE a.applicantUserId = :userId")
    List<String> findJobIdsAppliedToBy(Long userId);
}
