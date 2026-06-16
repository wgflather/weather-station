package com.flather.weatherstation.service;

public class SeeingCalculator {

  private static final double LAMBDA = 500e-9;
  private static final double K_SQ = Math.pow(2 * Math.PI / LAMBDA, 2);
  private static final double DH = 50.0;
  private static final double H_MAX = 25_000.0;

  // Hufnagel-Valley HV 5/7 profile: Cn²(h) in m^(-2/3)
  private static double cn2(double h, double vJetMs, double vGroundMs) {
    double free =
        0.00594 * Math.pow(vJetMs / 27.0, 2) * Math.pow(1e-5 * h, 10) * Math.exp(-h / 1000.0)
            + 2.7e-16 * Math.exp(-h / 1500.0);
    double A = 1.7e-14 * Math.pow(vGroundMs / 5.5, 2);
    return free + A * Math.exp(-h / 100.0);
  }

  // Returns FWHM seeing in arc-seconds at 500 nm, zenith angle = 0.
  public static double seeing(double vJetKmh, double vGroundKmh) {
    double vJet = Math.max(vJetKmh / 3.6, 1.0);
    double vGround = Math.max(vGroundKmh / 3.6, 0.5);

    double J = 0;
    for (double h = 0; h <= H_MAX; h += DH) {
      J += cn2(h, vJet, vGround) * DH;
    }

    double r0 = Math.pow(0.423 * K_SQ * J, -0.6);
    return 0.98 * LAMBDA / r0 * 206265.0;
  }

  public static String label(double arcsec) {
    if (arcsec < 1.0) return "Excellent";
    if (arcsec < 1.5) return "Good";
    if (arcsec < 2.0) return "Fair";
    if (arcsec < 3.0) return "Poor";
    return "Very Poor";
  }

  public static int score(double arcsec) {
    if (arcsec < 1.0) return 5;
    if (arcsec < 1.5) return 4;
    if (arcsec < 2.0) return 3;
    if (arcsec < 3.0) return 2;
    return 1;
  }
}
