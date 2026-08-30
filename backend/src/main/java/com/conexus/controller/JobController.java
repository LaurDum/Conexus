package com.conexus.controller;

import com.conexus.model.Job;
import com.conexus.model.User;
import com.conexus.repository.JobRepository;
import com.conexus.repository.ProfileInfoRepository;
import com.conexus.repository.UserRepository;
import com.conexus.model.ProfileInfo;
import com.conexus.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.Collections;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/jobs")
@RequiredArgsConstructor
public class JobController {

    private final JobRepository jobRepository;
    private final UserRepository userRepository;
    private final ProfileInfoRepository profileInfoRepository;

    /**
     * POST /api/jobs — a creator posting what they are looking for.
     *
     * The company and logo are taken from the poster's own account, so a
     * request reads as coming from them rather than an invented brand.
     */
    @PostMapping
    @Transactional
    public ResponseEntity<?> create(@CurrentUser Long userId, @RequestBody Job job) {
        if (job.getTitle() == null || job.getTitle().isBlank()) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "What are you looking for?"));
        }
        if (job.getJobType() == null || job.getJobType().isBlank()) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "Pick a type of work"));
        }

        User poster = userRepository.findById(userId).orElse(null);
        if (poster == null) {
            return ResponseEntity.status(401).body(Collections.singletonMap("message", "Sign in to continue"));
        }

        String name = profileInfoRepository.findByUserId(userId)
                .map(ProfileInfo::getDisplayName)
                .filter(n -> n != null && !n.isBlank())
                .orElseGet(() -> poster.getDisplayName() != null ? poster.getDisplayName() : poster.getUsername());

        job.setId("job_u" + userId + "_" + System.currentTimeMillis());
        job.setPostedByUserId(userId);
        job.setCompany(name);
        job.setLogo(poster.getAvatar());
        job.setLogoClass(poster.getBgClass() != null ? poster.getBgClass() : "logo-tech");
        job.setCategory(poster.getCategory());
        job.setPostedAgo("Just now");

        if (job.getLocation() == null || job.getLocation().isBlank()) {
            job.setLocation(job.isRemote() ? "Remote" : (poster.getLocation() != null ? poster.getLocation() : "Worldwide"));
        }

        return ResponseEntity.ok(jobRepository.save(job));
    }

    /** DELETE /api/jobs/{id} — only whoever posted it. */
    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<?> delete(@CurrentUser Long userId, @PathVariable String id) {
        Job job = jobRepository.findById(id).orElse(null);
        if (job == null) return ResponseEntity.noContent().build();

        if (!userId.equals(job.getPostedByUserId())) {
            return ResponseEntity.status(403)
                    .body(Collections.singletonMap("message", "That listing is not yours to remove"));
        }
        jobRepository.delete(job);
        return ResponseEntity.noContent().build();
    }

    /** GET /api/jobs?type=&search=&remote=&page=0&size=12 */
    @GetMapping
    public Map<String, Object> browse(@CurrentUser Long userId,
                                      @RequestParam(required = false) String type,
                                      @RequestParam(required = false) String search,
                                      @RequestParam(required = false) Boolean remote,
                                      @RequestParam(defaultValue = "0") int page,
                                      @RequestParam(defaultValue = "12") int size) {

        String needle = search == null ? "" : search.trim().toLowerCase();
        String wantedType = type == null || type.isBlank() || "all".equalsIgnoreCase(type) ? null : type.trim();

        User me = userRepository.findById(userId).orElse(null);
        String myCategory = me != null && me.getCategory() != null ? me.getCategory() : "";

        List<Job> all = jobRepository.findAll().stream()
                .filter(j -> wantedType == null || wantedType.equalsIgnoreCase(j.getJobType()))
                .filter(j -> remote == null || j.isRemote() == remote)
                .filter(j -> needle.isEmpty()
                        || j.getTitle().toLowerCase().contains(needle)
                        || (j.getCompany() != null && j.getCompany().toLowerCase().contains(needle))
                        || (j.getDescription() != null && j.getDescription().toLowerCase().contains(needle)))
                // Roles in your own niche first, as with brand deals.
                // Your niche first, then newest — a request posted just now should
                // not be buried alphabetically.
                .sorted(Comparator.comparing((Job j) -> !myCategory.equalsIgnoreCase(j.getCategory()))
                        .thenComparing(Comparator.comparing(
                                (Job j) -> j.getCreatedAt() == null ? java.time.Instant.EPOCH : j.getCreatedAt()).reversed())
                        .thenComparing(Job::getTitle, String.CASE_INSENSITIVE_ORDER))
                .collect(Collectors.toList());

        int from = Math.max(0, page * size);
        int to = Math.min(all.size(), from + size);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", from >= all.size() ? List.of() : all.subList(from, to));
        result.put("total", all.size());
        result.put("hasMore", to < all.size());
        result.put("types", jobRepository.findDistinctJobTypes());
        return result;
    }
}
