package com.conexus.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import javax.persistence.*;
import java.time.LocalDate;

/**
 * A user's total followers across their linked platforms on one day. One row
 * per user per day, so reach can be drawn over time.
 */
@Entity
@Table(name = "reach_snapshots",
       uniqueConstraints = @UniqueConstraint(columnNames = { "userId", "day" }))
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReachSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false)
    private LocalDate day;

    @Column(nullable = false)
    private long total;
}
