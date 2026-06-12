package com.flather.weatherstation.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class LoginController {

  @GetMapping("/login")
  public String login() {
    return "login";
  }

  // Without a handler for "/", the request 404s into "/error", which is not
  // permitted, so Spring bounces it to "/login" — send it to the dashboard.
  @GetMapping("/")
  public String home() {
    return "redirect:/weather";
  }
}
