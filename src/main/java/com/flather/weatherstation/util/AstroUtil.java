package com.flather.weatherstation.util;

public class AstroUtil {
    private static final double LUNAR_CYCLE_DAYS = 29.53059;
    private static final double AU_TO_KM = 149_597_870.7;
    public static double convertAuToKm(double au){
        return au *  AU_TO_KM;
    }
    // =========================================================
    // MOON PHASE CORE
    // =========================================================

    public static double getMoonPhasePercentage(double phaseDegrees) {
        return phaseDegrees * 100.0;
    }



    public static double getMoonAgeDays(double phaseDegrees) {
        return (phaseDegrees / 360.0) * LUNAR_CYCLE_DAYS;
    }

    public static String getMoonPhaseName(double phaseDegrees) {
        return getPhaseName(phaseDegrees);
    }

    // =========================================================
    // PHASE NAME MAPPING
    // =========================================================

    public static String getPhaseName(double degrees) {

        // Normalize to 0–360
        degrees = (degrees % 360 + 360) % 360;

        if (degrees < 10 || degrees > 350) {
            return "New Moon";
        }

        if (degrees < 80) {
            return "Waxing Crescent";
        }

        if (degrees < 100) {
            return "First Quarter";
        }

        if (degrees < 170) {
            return "Waxing Gibbous";
        }

        if (degrees < 190) {
            return "Full Moon";
        }

        if (degrees < 260) {
            return "Waning Gibbous";
        }

        if (degrees < 280) {
            return "Last Quarter";
        }

        return "Waning Crescent";
    }
}
