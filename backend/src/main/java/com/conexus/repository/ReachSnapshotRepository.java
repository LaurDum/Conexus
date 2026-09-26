package com.conexus.repository;

import com.conexus.model.ReachSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface ReachSnapshotRepository extends JpaRepository<ReachSnapshot, Long> {

    Optional<ReachSnapshot> findByUserIdAndDay(Long userId, LocalDate day);

    List<ReachSnapshot> findByUserIdAndDayBetweenOrderByDayAsc(Long userId, LocalDate from, LocalDate to);

    /** The last known value before a window starts, so a quiet week still draws a line. */
    Optional<ReachSnapshot> findTopByUserIdAndDayLessThanOrderByDayDesc(Long userId, LocalDate day);

    boolean existsByUserId(Long userId);
}
