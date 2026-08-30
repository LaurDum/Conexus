package com.conexus.controller;

import com.conexus.model.Job;
import com.conexus.model.User;
import com.conexus.repository.JobRepository;
import com.conexus.repository.UserRepository;
import com.conexus.security.CurrentUser;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

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
                .sorted(Comparator.comparing((Job j) -> !myCategory.equalsIgnoreCase(j.getCategory()))
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
