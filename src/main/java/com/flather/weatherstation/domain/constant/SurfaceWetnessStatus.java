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
    public static SurfaceWetnessStatus classify(double transformedAdc) {

        if (transformedAdc < 10) return DRY;
        if (transformedAdc < 40) return DAMP;
        if (transformedAdc < 70) return WET;
        return SOAKED;
    }
}
