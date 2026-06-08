package com.flather.weatherstation.domain.constant;

public enum DewPointRisk {

        SATURATED("Air Saturated"),
        VERY_LIKELY("Condensation Likely"),
        POSSIBLE("Condensation Possible"),
        UNLIKELY("Condensation Unlikely");


    private final String label;

    DewPointRisk(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }

    // spread = temperature - dewPoint
    // smaller spread = air closer to saturation
    public static DewPointRisk classify(double spread) {
        if (spread <= 2.0) return SATURATED;
        if (spread <= 4.0) return VERY_LIKELY;
        if (spread <= 6.5) return POSSIBLE;
        return UNLIKELY;
    }
}