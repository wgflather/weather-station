package com.flather.weatherstation.domain.constant;

public enum WindDirectionLabel {
  N,
  NNE,
  NE,
  ENE,
  E,
  ESE,
  SE,
  SSE,
  S,
  SSW,
  SW,
  WSW,
  W,
  WNW,
  NW,
  NNW;

  private static final WindDirectionLabel[] SECTORS = values();

  public static WindDirectionLabel fromDegrees(double degrees) {
    double normalized = ((degrees % 360) + 360) % 360;
    int index = (int) Math.round(normalized / 22.5) % 16;
    return SECTORS[index];
  }
}
