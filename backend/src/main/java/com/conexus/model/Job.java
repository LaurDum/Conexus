package com.conexus.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import javax.persistence.*;

/** A paid role a company is hiring a creator for. */
@Entity
@Table(name = "jobs")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Job {

    @Id
    @Column(nullable = false, unique = true)
    private String id;

    @Column(nullable = false)
    private String title;

    private String company;

    /** Initials for the logo tile. */
    private String logo;
    private String logoClass;

    private String location;

    /** Full-time, Contract, Freelance, Part-time, Internship */
    @Column(nullable = false)
    private String jobType;

    /** The niche it suits, used to rank: Tech, Gaming, Travel... */
    private String category;

    @Builder.Default
    private boolean remote = false;

    @Column(columnDefinition = "TEXT")
    private String description;

    private String pay;

    private String postedAgo;

    /**
     * Set when a creator posted this themselves ("looking for a video editor").
     * Null for the seeded company listings.
     */
    private Long postedByUserId;

    @org.hibernate.annotations.CreationTimestamp
    @Column(updatable = false)
    private java.time.Instant createdAt;
}
