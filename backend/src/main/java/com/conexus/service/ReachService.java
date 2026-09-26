package com.conexus.service;

import com.conexus.model.ReachSnapshot;
import com.conexus.model.SocialAccount;
import com.conexus.repository.ReachSnapshotRepository;
import com.conexus.repository.SocialAccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Keeps one reach figure per user per day. Follower counts are entered by
 * hand, so the history is only as fresh as the last edit, but it lets Home
 * show whether reach is moving rather than just what it is.
 */
@Service
@RequiredArgsConstructor
public class ReachService {

    private final ReachSnapshotRepository snapshotRepository;
    private final SocialAccountRepository socialAccountRepository;

    private static final Pattern COUNT = Pattern.compile("^([\\d.,]+)\\s*([kKmM]?)");

    /** "18.2K" → 18200, "1.2M" → 1200000, "950" → 950; anything else is 0. */
    public static long parseCount(String text) {
        if (text == null) return 0;
        Matcher m = COUNT.matcher(text.trim());
        if (!m.find()) return 0;
        try {
            double n = Double.parseDouble(m.group(1).replace(",", ""));
            String unit = m.group(2).toLowerCase();
            if (unit.equals("k")) n *= 1_000;
            if (unit.equals("m")) n *= 1_000_000;
            return Math.round(n);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    public long currentTotal(Long userId) {
        return socialAccountRepository.findByUserId(userId).stream()
                .map(SocialAccount::getFollowers)
                .mapToLong(ReachService::parseCount)
                .sum();
    }

    /** Writes today's figure, replacing an earlier one from the same day. */
    @Transactional
    public void record(Long userId) {
        if (userId == null) return;
        long total = currentTotal(userId);
        LocalDate today = LocalDate.now();

        ReachSnapshot snap = snapshotRepository.findByUserIdAndDay(userId, today)
                .orElseGet(() -> ReachSnapshot.builder().userId(userId).day(today).build());
        if (snap.getId() != null && snap.getTotal() == total) return;
        snap.setTotal(total);
        snapshotRepository.save(snap);
    }

    /**
     * The last {@code days} days as points, oldest first. The value from before
     * the window, if any, opens it — reach that did not change still has a line.
     */
    public Map<String, Object> history(Long userId, int days) {
        LocalDate today = LocalDate.now();
        LocalDate start = today.minusDays(days - 1L);

        List<Map<String, Object>> points = new ArrayList<>();
        snapshotRepository.findTopByUserIdAndDayLessThanOrderByDayDesc(userId, start)
                .ifPresent(before -> points.add(point(start, before.getTotal())));

        for (ReachSnapshot s : snapshotRepository.findByUserIdAndDayBetweenOrderByDayAsc(userId, start, today)) {
            if (!points.isEmpty() && points.get(points.size() - 1).get("day").equals(s.getDay().toString())) {
                points.remove(points.size() - 1);
            }
            points.add(point(s.getDay(), s.getTotal()));
        }

        long first = points.isEmpty() ? 0 : (long) points.get(0).get("total");
        long last = points.isEmpty() ? 0 : (long) points.get(points.size() - 1).get("total");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("days", days);
        out.put("from", start.toString());
        out.put("to", today.toString());
        out.put("points", points);
        out.put("change", last - first);
        return out;
    }

    private static Map<String, Object> point(LocalDate day, long total) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("day", day.toString());
        p.put("total", total);
        return p;
    }
}
