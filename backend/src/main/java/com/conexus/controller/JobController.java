package com.conexus.controller;

import com.conexus.model.Job;
import com.conexus.model.User;
import com.conexus.model.JobApplication;
import com.conexus.repository.JobApplicationRepository;
import com.conexus.repository.JobRepository;
import com.conexus.repository.ProfileInfoRepository;
import com.conexus.repository.UserRepository;
import com.conexus.model.ProfileInfo;
import com.conexus.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import com.conexus.model.Notification;
import com.conexus.service.NotificationService;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

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
    private final JobApplicationRepository jobApplicationRepository;
    private final UserRepository userRepository;
    private final ProfileInfoRepository profileInfoRepository;
    private final NotificationService notificationService;

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

    /** POST /api/jobs/{id}/apply — apply to a listing. */
    @PostMapping("/{id}/apply")
    @Transactional
    public ResponseEntity<?> apply(@CurrentUser Long userId, @PathVariable String id,
                                   @RequestBody(required = false) ApplyRequest req) {
        Job job = jobRepository.findById(id).orElse(null);
        if (job == null) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "That listing no longer exists"));
        }
        if (userId.equals(job.getPostedByUserId())) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "This is your own listing"));
        }
        if (jobApplicationRepository.findByJobIdAndApplicantUserId(id, userId).isPresent()) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("message", "You have already applied"));
        }

        jobApplicationRepository.save(JobApplication.builder()
                .jobId(id)
                .applicantUserId(userId)
                .message(req == null ? null : req.getMessage())
                .build());

        // Tell the creator who posted it. Company listings have nobody to tell.
        if (job.getPostedByUserId() != null) {
            notificationService.notify(job.getPostedByUserId(), userId, NotificationService.JOB_APPLICATION,
                    Notification.builder().excerpt("applied to \"" + job.getTitle() + "\""));
        }

        return ResponseEntity.ok(Map.of("applied", true));
    }

    /** DELETE /api/jobs/{id}/apply — withdraw an application. */
    @DeleteMapping("/{id}/apply")
    @Transactional
    public ResponseEntity<?> withdraw(@CurrentUser Long userId, @PathVariable String id) {
        jobApplicationRepository.findByJobIdAndApplicantUserId(id, userId)
                .ifPresent(jobApplicationRepository::delete);
        return ResponseEntity.ok(Map.of("applied", false));
    }

    /** GET /api/jobs/{id}/applications — who applied, for the poster only. */
    @GetMapping("/{id}/applications")
    public ResponseEntity<?> applications(@CurrentUser Long userId, @PathVariable String id) {
        Job job = jobRepository.findById(id).orElse(null);
        if (job == null || !userId.equals(job.getPostedByUserId())) {
            return ResponseEntity.status(403)
                    .body(Collections.singletonMap("message", "That listing is not yours"));
        }

        List<Map<String, Object>> out = jobApplicationRepository.findByJobIdOrderByCreatedAtDesc(id).stream()
                .map(a -> {
                    User applicant = userRepository.findById(a.getApplicantUserId()).orElse(null);
                    String name = applicant == null ? "Someone"
                            : profileInfoRepository.findByUserId(a.getApplicantUserId())
                                .map(ProfileInfo::getDisplayName)
                                .filter(n -> n != null && !n.isBlank())
                                .orElseGet(() -> applicant.getDisplayName() != null
                                        ? applicant.getDisplayName() : applicant.getUsername());

                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("id", a.getId());
                    m.put("userId", a.getApplicantUserId());
                    m.put("name", name);
                    m.put("avatar", applicant != null ? applicant.getAvatar() : "?");
                    m.put("bgClass", applicant != null ? applicant.getBgClass() : "avatar-purple");
                    m.put("niche", applicant != null ? applicant.getNiche() : "Conexus Creator");
                    m.put("message", a.getMessage());
                    return m;
                })
                .collect(Collectors.toList());

        return ResponseEntity.ok(Map.of("items", out, "total", out.size()));
    }

    @lombok.Data
    public static class ApplyRequest {
        private String message;
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
        // Otherwise the applications outlive the listing they belong to.
        jobApplicationRepository.deleteByJobId(id);
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
                // Your own listings first so you can see who applied, then your
                // niche, then newest.
                .sorted(Comparator.comparing((Job j) -> !userId.equals(j.getPostedByUserId()))
                        .thenComparing(j -> !myCategory.equalsIgnoreCase(j.getCategory()))
                        .thenComparing(Comparator.comparing(
                                (Job j) -> j.getCreatedAt() == null ? java.time.Instant.EPOCH : j.getCreatedAt()).reversed())
                        .thenComparing(Job::getTitle, String.CASE_INSENSITIVE_ORDER))
                .collect(Collectors.toList());

        int from = Math.max(0, page * size);
        int to = Math.min(all.size(), from + size);

        List<Job> pageItems = from >= all.size() ? List.of() : all.subList(from, to);

        // Whether the caller has applied, and how many applied to their own
        // listings — both derived per request rather than stored on the job.
        Set<String> appliedTo = new HashSet<>(jobApplicationRepository.findJobIdsAppliedToBy(userId));
        List<Map<String, Object>> cards = pageItems.stream().map(j -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", j.getId());
            m.put("title", j.getTitle());
            m.put("company", j.getCompany());
            m.put("logo", j.getLogo());
            m.put("logoClass", j.getLogoClass());
            m.put("location", j.getLocation());
            m.put("jobType", j.getJobType());
            m.put("category", j.getCategory());
            m.put("remote", j.isRemote());
            m.put("description", j.getDescription());
            m.put("pay", j.getPay());
            m.put("postedAgo", j.getPostedAgo());
            m.put("postedByUserId", j.getPostedByUserId());
            m.put("mine", userId.equals(j.getPostedByUserId()));
            m.put("applied", appliedTo.contains(j.getId()));
            m.put("applicationCount", userId.equals(j.getPostedByUserId())
                    ? jobApplicationRepository.countByJobId(j.getId()) : 0);
            return m;
        }).collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", cards);
        result.put("total", all.size());
        result.put("hasMore", to < all.size());
        result.put("types", jobRepository.findDistinctJobTypes());
        return result;
    }
}
