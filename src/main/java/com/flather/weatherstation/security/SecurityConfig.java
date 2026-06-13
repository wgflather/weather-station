package com.flather.weatherstation.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

  @Bean
  public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {

    http.csrf(AbstractHttpConfigurer::disable)
        .authorizeHttpRequests(
            auth ->
                auth
                    // Admin area only: the config UI (static /admin/config.html)
                    // and its write API both require the ADMIN role.
                    .requestMatchers("/admin/**", "/api/admin/**")
                    .hasRole("ADMIN")
                    // Everything else — dashboard, public API, static assets,
                    // login page — is open to anyone.
                    .anyRequest()
                    .permitAll())
        .httpBasic(Customizer.withDefaults())
        .formLogin(
            form ->
                form.loginPage("/login")
                    .defaultSuccessUrl(
                        "/admin/config.html", true) // Forces redirection to "/" after login success
                    .permitAll());

    return http.build();
  }

  @Bean
  public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  @Bean
  public UserDetailsService userDetailsService(PasswordEncoder passwordEncoder) {
    UserDetails admin =
        User.withUsername("admin") // Changed name to match intent
            .password(passwordEncoder.encode("1234"))
            .roles("USER", "ADMIN")
            .build();

    return new InMemoryUserDetailsManager(admin);
  }
}
