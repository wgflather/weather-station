package com.flather.weatherstation.domain.constant;

public enum UvLevel {
  LOW("Low"),
  MODERATE("Moderate"),
  HIGH("High"),
  VERY_HIGH("Very High"),
  EXTREME("Extreme");

  private final String label;

  UvLevel(String label) {
    this.label = label;
  }

  public String getLabel() {
    return label;
  }

  public static UvLevel fromIndex(Double index) {
    if (index == null) return null;
    if (index < 3) return LOW;
    if (index < 6) return MODERATE;
    if (index < 8) return HIGH;
    if (index < 11) return VERY_HIGH;
    return EXTREME;
  }
}
