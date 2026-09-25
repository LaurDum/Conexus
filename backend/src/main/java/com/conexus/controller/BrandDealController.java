package com.conexus.controller;

import com.conexus.model.BrandDeal;
import com.conexus.model.User;
import com.conexus.repository.BrandDealRepository;
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
@RequestMapping("/api/brand-deals")
@RequiredArgsConstructor
public class BrandDealController {

    private final BrandDealRepository brandDealRepository;
    private final UserRepository userRepository;

    /**
     * GET /api/brand-deals?type=&search=&page=0&size=12
     *
     * Deals matching the caller's own niche come first, so "recommended" means
     * something rather than being whatever order the rows happen to be in.
     */
    @GetMapping
    public Map<String, Object> browse(@CurrentUser Long userId,
                                      @RequestParam(required = false) String type,
                                      @RequestParam(required = false) String search,
                                      @RequestParam(defaultValue = "0") int page,
                                      @RequestParam(defaultValue = "12") int size) {

        String needle = search == null ? "" : search.trim().toLowerCase();
        String wantedType = type == null || type.isBlank() || "all".equalsIgnoreCase(type) ? null : type.trim();

        User me = userRepository.findById(userId).orElse(null);
        String myCategory = me != null && me.getCategory() != null ? me.getCategory() : "";

        size = Math.max(1, Math.min(size, 100));
        page = Math.max(0, page);

        List<BrandDeal> all = brandDealRepository.findAll().stream()
                .filter(d -> wantedType == null || wantedType.equalsIgnoreCase(d.getDealType()))
                .filter(d -> needle.isEmpty()
                        || d.getBrandName().toLowerCase().contains(needle)
                        || (d.getIndustry() != null && d.getIndustry().toLowerCase().contains(needle))
                        || (d.getDescription() != null && d.getDescription().toLowerCase().contains(needle)))
                .sorted(Comparator
                        // Your own niche first, then by how strong the match is.
                        .comparing((BrandDeal d) -> !myCategory.equalsIgnoreCase(d.getCategory()))
                        .thenComparing(Comparator.comparingInt(BrandDeal::getMatchScore).reversed()))
                .collect(Collectors.toList());

        int from = Math.max(0, page * size);
        int to = Math.min(all.size(), from + size);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("items", from >= all.size() ? List.of() : all.subList(from, to));
        result.put("total", all.size());
        result.put("hasMore", to < all.size());
        result.put("types", brandDealRepository.findDistinctDealTypes());
        return result;
    }
}
