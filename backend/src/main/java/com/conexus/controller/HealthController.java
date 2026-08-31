package com.conexus.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.sql.DataSource;
import java.sql.Connection;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * A public endpoint a hosting platform can poll.
 *
 * Every other /api route needs a token, so without this a health check has
 * nothing to hit — and checking only that the port is open would report a
 * healthy service that cannot reach its database.
 */
@RestController
@RequestMapping("/api/health")
@RequiredArgsConstructor
@Slf4j
public class HealthController {

    private final DataSource dataSource;

    @GetMapping
    public ResponseEntity<Map<String, Object>> health() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "up");

        try (Connection c = dataSource.getConnection()) {
            body.put("database", c.isValid(2) ? "up" : "unreachable");
        } catch (Exception e) {
            log.warn("Health check could not reach the database: {}", e.getMessage());
            body.put("status", "degraded");
            body.put("database", "unreachable");
            // 503 so the platform knows not to send traffic here yet.
            return ResponseEntity.status(503).body(body);
        }

        return ResponseEntity.ok(body);
    }
}
