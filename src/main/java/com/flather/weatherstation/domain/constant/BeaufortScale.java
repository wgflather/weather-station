package com.flather.weatherstation.domain.constant;

import com.fasterxml.jackson.annotation.JsonFormat;

@JsonFormat(shape = JsonFormat.Shape.OBJECT)
public enum BeaufortScale {
  BFT_0(0, "Calm"),
  BFT_1(1, "Light air"),
  BFT_2(2, "Light breeze"),
  BFT_3(3, "Gentle breeze"),
  BFT_4(4, "Moderate breeze"),
  BFT_5(5, "Fresh breeze"),
  BFT_6(6, "Strong breeze"),
  BFT_7(7, "Near gale"),
  BFT_8(8, "Gale"),
  BFT_9(9, "Severe gale"),
  BFT_10(10, "Storm"),
  BFT_11(11, "Violent storm"),
  BFT_12(12, "Hurricane");

  private final int number;
  private final String description;

  BeaufortScale(int number, String description) {
    this.number = number;
    this.description = description;
  }

  public int getNumber() {
    return number;
  }

  public String getDescription() {
    return description;
  }

  /** Converts m/s to Beaufort using the WMO upper-bound table. */
  public static BeaufortScale fromMs(Double speedMs) {
    if (speedMs == null) return null;
    if (speedMs < 0.3) return BFT_0;
    if (speedMs < 1.6) return BFT_1;
    if (speedMs < 3.4) return BFT_2;
    if (speedMs < 5.5) return BFT_3;
    if (speedMs < 8.0) return BFT_4;
    if (speedMs < 10.8) return BFT_5;
    if (speedMs < 13.9) return BFT_6;
    if (speedMs < 17.2) return BFT_7;
    if (speedMs < 20.8) return BFT_8;
    if (speedMs < 24.5) return BFT_9;
    if (speedMs < 28.5) return BFT_10;
    if (speedMs < 32.7) return BFT_11;
    return BFT_12;
  }
}
