package com.flather.weatherstation.service;

import com.flather.weatherstation.entity.DataQuality;
import com.flather.weatherstation.entity.WeatherRecordCreatedDto;
import com.flather.weatherstation.entity.WeatherRecordResponseDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class DataQualityValidator {

    public boolean checkForDataAnomaly(WeatherRecordCreatedDto anomalyDto){
        boolean isAnomaly = false;

        if(anomalyDto.getTemperature() < -40 || anomalyDto.getTemperature() > 50){
            log.warn("[DATA_ANOMALY] Temperature is unrealistic: {} ℃", anomalyDto.getTemperature());
            isAnomaly = true;

        }

        if(anomalyDto.getPressure() < 950 || anomalyDto.getPressure() > 1100){
            log.warn("[DATA_ANOMALY] Pressure is unrealistic: {} hPa", anomalyDto.getPressure());
            isAnomaly = true;
        }

        return isAnomaly;
    }

    public boolean checkForDataSpikes(WeatherRecordCreatedDto weatherRecordDto, WeatherRecordResponseDto lastRecord){
        double newTemp = weatherRecordDto.getTemperature();
        double lastTemp = lastRecord.getTemperature();

        double newPressure = weatherRecordDto.getPressure();
        double lastPressure = lastRecord.getPressure();

        boolean isSpike = false;

        if (Math.abs(newTemp - lastTemp) > 10) {
            log.warn("[DATA_SPIKE] Last temp read: {} ℃ Current temp read: {} ℃",
                    lastRecord.getTemperature(), weatherRecordDto.getTemperature());
            isSpike = true;
        }

        if (Math.abs(newPressure - lastPressure) > 3) {
            log.warn("[DATA_SPIKE] Last pressure read: {} pHa Current pressure read: {} hPa",
                    lastRecord.getPressure(), weatherRecordDto.getPressure());
            isSpike = true;
        }

        return isSpike;

    }

    public DataQuality setDataQualityStatus(boolean anomaly, boolean spike) {
        if (anomaly) return DataQuality.ANOMALY;
        if (spike) return DataQuality.SPIKE;
        return DataQuality.OK;
    }
}
