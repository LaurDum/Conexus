package com.conexus.auth;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Slows down password guessing. Failed sign-ins are counted per account and per
 * address; past the limit, further attempts are refused until the window ends.
 * Kept in memory, which is enough for a single server.
 */
@Component
public class LoginThrottle {

    private static final int MAX_PER_ACCOUNT = 5;
    private static final int MAX_PER_ADDRESS = 20;
    private static final Duration WINDOW = Duration.ofMinutes(15);

    private static class Failures {
        int count;
        Instant since = Instant.now();
    }

    private final Map<String, Failures> failures = new ConcurrentHashMap<>();

    /** Minutes left before another attempt is allowed, or 0 when it is allowed now. */
    public long minutesLocked(String identifier, String address) {
        return Math.max(locked("acct:" + identifier, MAX_PER_ACCOUNT),
                locked("addr:" + address, MAX_PER_ADDRESS));
    }

    public void recordFailure(String identifier, String address) {
        bump("acct:" + identifier);
        bump("addr:" + address);
    }

    public void recordSuccess(String identifier) {
        failures.remove("acct:" + identifier);
    }

    private long locked(String key, int max) {
        Failures f = failures.get(key);
        if (f == null) return 0;
        Instant until = f.since.plus(WINDOW);
        if (Instant.now().isAfter(until)) {
            failures.remove(key);
            return 0;
        }
        return f.count >= max ? Math.max(1, Duration.between(Instant.now(), until).toMinutes() + 1) : 0;
    }

    private void bump(String key) {
        failures.compute(key, (k, f) -> {
            if (f == null || Instant.now().isAfter(f.since.plus(WINDOW))) f = new Failures();
            f.count++;
            return f;
        });
        // Keep the map from growing without bound under a spray of usernames.
        if (failures.size() > 10_000) {
            failures.entrySet().removeIf(e -> Instant.now().isAfter(e.getValue().since.plus(WINDOW)));
        }
    }
}
