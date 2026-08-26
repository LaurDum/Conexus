package com.conexus;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@SpringBootApplication
@EntityScan(basePackages = "com.conexus.model")
@EnableJpaRepositories(basePackages = "com.conexus.repository")
public class ConexusApplication {

    public static void main(String[] args) {
        SpringApplication.run(ConexusApplication.class, args);
    }
}
