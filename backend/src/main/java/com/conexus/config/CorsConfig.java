package com.conexus.config;

import com.conexus.security.AuthInterceptor;
import com.conexus.security.CurrentUserArgumentResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Web layer configuration: which origins may call the API, and which endpoints
 * require a signed-in user.
 */
@Configuration
@RequiredArgsConstructor
public class CorsConfig implements WebMvcConfigurer {

    private final AuthInterceptor authInterceptor;
    private final CurrentUserArgumentResolver currentUserArgumentResolver;

    /**
     * Extra origins allowed to call the API, comma separated. Set
     * CORS_ALLOWED_ORIGINS to the deployed frontend URL when hosting.
     */
    @Value("${CORS_ALLOWED_ORIGINS:}")
    private String extraAllowedOrigins;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        List<String> patterns = new ArrayList<>(Arrays.asList(
                "http://localhost:*",
                "http://127.0.0.1:*",
                "http://192.168.*.*:*",
                "http://10.*.*.*:*"
        ));

        for (String origin : extraAllowedOrigins.split(",")) {
            if (!origin.trim().isEmpty()) {
                patterns.add(origin.trim());
            }
        }

        registry.addMapping("/api/**")
                .allowedOriginPatterns(patterns.toArray(new String[0]))
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // Everything under /api requires a valid token except signing in and
        // registering — you cannot present a token before you have one.
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns("/api/auth/register", "/api/auth/login", "/api/health");
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(currentUserArgumentResolver);
    }
}
