package com.flather.weatherstation.service;

import com.flather.weatherstation.config.TimezoneProperties;
import com.flather.weatherstation.dto.analytics.*;
import com.flather.weatherstation.dto.dashboard.ChartDto;
import com.flather.weatherstation.dto.projection.DataPoint;
import com.flather.weatherstation.model.constant.TrendDirection;
import com.flather.weatherstation.repository.WeatherReportRepository;

import org.apache.commons.math3.stat.regression.SimpleRegression;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.*;

@Service
@Transactional(readOnly = true)
public class AnalyticsService {
    private final WeatherReportRepository repository;
    private final ZoneId zoneId;

    public AnalyticsService(WeatherReportRepository repository, TimezoneProperties timezoneProperties) {
        this.repository = repository;
        zoneId = ZoneId.of(timezoneProperties.getZoneId());
    }


    public long findTodayRecordsCount(){
        return repository.findRecordsToday();
    }

    public Optional<ZonedDateTime> findLastRecordTime(){
        return Optional.ofNullable(repository.findMaxMeasuredAt())
                .map(t -> t.atZone(zoneId));
    }

    public long getLagMinutes(ZonedDateTime lastRecord){
        return Duration.between(lastRecord,
                Instant.now().atZone(zoneId))
                .toMinutes();
    }

    public TemperatureDto getTemperature(){
        return repository.getTemperature();
    }

    public PressureDto getPressure(){
        return repository.getPressure();
    }

    public List<HourlyChartAvgDto> getTemperatureChartData(Instant since){
        return dataPointToDto(repository.findTodayChartTemperature(since));
    }

    public List<HourlyChartAvgDto> getPressureChartData(Instant since){
        return dataPointToDto(repository.findTodayChartPressure(since));
    }

    private List<HourlyChartAvgDto> dataPointToDto(List<DataPoint> dataPoints){
        return dataPoints.stream()
                .map(projection ->
                        new HourlyChartAvgDto(projection.hour().atZone(zoneId), projection.value())
                )
                .toList();
    }


    public ChartDto returnChart(String metric, String since){
        Instant sinceInstant = (since == null) ?
                LocalDate.now(zoneId)
                .atStartOfDay(zoneId).
                toInstant() : OffsetDateTime.parse(since).toInstant();

        List<HourlyChartAvgDto> dtos;


        if("temperature".equals(metric)){
            dtos = getTemperatureChartData(sinceInstant);
        }else {
            dtos = getPressureChartData(sinceInstant);
        }

        Instant nextBucketExpectedAt = null;

        if (!dtos.isEmpty()) {
            nextBucketExpectedAt =
                    getNextExpectedBucketEpochMillis(dtos.getLast().hour());
        }

        return new ChartDto(metric, dtos, nextBucketExpectedAt);
    }

    private Instant getNextExpectedBucketEpochMillis(ZonedDateTime zonedDateTime){
        return zonedDateTime.toInstant().plusSeconds(600);
    }

    public TrendResult getTempTrend(){
        return calculateTrend(repository.getLastHourTemperature());
    }

    public TrendResult getPressureTrend(){
        return calculateTrend(repository.getLastHourPressure());
    }


    public TrendResult calculateTrend(List<DataPoint> dataPoints){
        if(dataPoints == null || dataPoints.size() < 2){
            return new TrendResult(0.0, TrendDirection.STABLE);
        }

        Instant firstDataTime = dataPoints.getFirst().hour();

        SimpleRegression regression = new SimpleRegression();

        for(DataPoint point : dataPoints){
            double x = Duration.between(firstDataTime, point.hour())
                    .toMillis() / 1000.0;

            double y = point.value();

            regression.addData(x, y);
        }

        double slope = regression.getSlope();

        double hourlyChange = slope * 3600.0;

        hourlyChange = Math.round(hourlyChange * 10.0) / 10.0;

        TrendDirection direction;

        if(Math.abs(hourlyChange) < 0.15){
            direction = TrendDirection.STABLE;
            hourlyChange = 0.0;
        } else if (hourlyChange > 0) {
            direction = TrendDirection.UP;
        } else {
            direction = TrendDirection.DOWN;
        }
        return new TrendResult(hourlyChange, direction);
    }

}
