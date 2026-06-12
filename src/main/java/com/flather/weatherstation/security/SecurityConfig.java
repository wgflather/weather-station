package com.flather.weatherstation.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                // 1. Configure authorization paths
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/login", "/api/weather/**", "/", "/weather", "/css/**", "/js/**").permitAll() // Allow public pages
                        .requestMatchers("/api/admin/**").authenticated()                  // Protect your API
                        .anyRequest().authenticated()
                )

                // 2. Configure the Form Login page redirect
                .formLogin(form -> form
                        .loginPage("/login")                                        // Your custom login UI endpoint
                        .permitAll()
                );

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public UserDetailsService userDetailsService(PasswordEncoder passwordEncoder) {
        // Create an admin user
        UserDetails admin = User.withUsername("flather")
                .password(passwordEncoder.encode("23606"))
                .roles("USER", "ADMIN")
                .build();

        return new InMemoryUserDetailsManager(admin);
    }
}