package com.flather.weatherstation.domain.constant;

public enum SurfaceWetnessStatus {
    DRY("Dry"),
    DAMP("Damp"),
    WET("Wet"),
    SOAKED("Soaked");

    private final String label;

    SurfaceWetnessStatus(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }

    // adcMax = 4095 for HW-028 12-bit sensor
    // wetnessPct = ((adcMax - rawValue) / adcMax) * 100
    public static SurfaceWetnessStatus classify(long rawAdc) {
        long clamped = Math.max(0, Math.min(4095, rawAdc));
        double pct  = ((4095.0 - clamped) / 4095.0) * 100.0;

        if (pct < 10) return DRY;
        if (pct < 40) return DAMP;
        if (pct < 70) return WET;
        return SOAKED;
    }
}
