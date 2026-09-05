package com.flather.weatherstation.domain.constant;

/**
 * The two gates that turn a bucket of wind-direction readings into a single bearing.
 *
 * <p>Shared rather than duplicated because both aggregation paths must apply them identically. The
 * hourly rollup ({@code WeatherRetentionRepository.rollupHourly}) writes the stored bearing, while
 * the raw chart query ({@code WeatherReportRepository.findChartWindDirection}) recomputes one for
 * days still inside the raw-retention window. A chart crossing that boundary would otherwise change
 * which readings it counts halfway along the x-axis — calm hours appearing as a confident bearing
 * on one side and as a gap on the other, from the same weather.
 */
public final class WindAggregation {

  /**
   * Wind direction is only aggregated from readings above this speed: a vane sitting in still air
   * reports noise, and averaging that noise in drags the resultant bearing off the real one.
   */
  public static final double CALM_THRESHOLD_MS = 0.5;

  /**
   * Below this resultant-vector length the bucket's bearings cancelled out and no single direction
   * describes it, so the bearing is emitted as null rather than as a meaningless number.
   */
  public static final double MIN_DIRECTION_CONSISTENCY = 0.05;

  private WindAggregation() {}
}
