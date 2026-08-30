package com.conexus.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;

import javax.persistence.*;
import java.time.Instant;

/**
 * One creator applying to one listing. The unique constraint means applying
 * twice is impossible rather than merely discouraged.
 */
@Entity
@Table(
    name = "job_applications",
    uniqueConstraints = @UniqueConstraint(name = "uk_job_applications_job_user", columnNames = {"job_id", "applicant_user_id"})
)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class JobApplication {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "job_id", nullable = false)
    private String jobId;

    @Column(name = "applicant_user_id", nullable = false)
    private Long applicantUserId;

    @Column(columnDefinition = "TEXT")
    private String message;

    @CreationTimestamp
    @Column(updatable = false)
    private Instant createdAt;
}
