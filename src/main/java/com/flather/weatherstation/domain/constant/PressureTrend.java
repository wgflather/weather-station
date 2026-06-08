package com.flather.weatherstation.domain.constant;

import com.flather.weatherstation.dto.analytics.TrendResult;

public enum PressureTrend {
    RISING_FAST("Rapidly rising"),
    RISING("Rising"),
    RISING_SLOW("Slowly rising"),
    STABLE("Stable"),
    FALLING_SLOW("Slowly falling"),
    FALLING("Falling"),
    FALLING_FAST("Rapidly falling");

    private final String label;

    PressureTrend(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }

    public static PressureTrend classify(TrendResult result) {
        double abs = Math.abs(result.changeValue());

        if (abs < 0.5) return STABLE;

        if (result.direction().equals(TrendDirection.UP)) {
            if (abs < 1.5) return RISING_SLOW;
            if (abs < 3.0) return RISING;
            return RISING_FAST;
        }

        if (result.direction().equals(TrendDirection.DOWN)) {
            if (abs < 1.5) return FALLING_SLOW;
            if (abs < 3.0) return FALLING;
            return FALLING_FAST;
        }

        return STABLE;
    }
}