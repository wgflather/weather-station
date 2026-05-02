package com.flather.weatherstation.service;

import com.flather.weatherstation.config.WeatherValidationProperties;
import com.flather.weatherstation.model.constant.DataQuality;
import com.flather.weatherstation.dto.weather.WeatherRecordCreatedDto;
import com.flather.weatherstation.dto.weather.WeatherRecordResponseDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class DataQualityValidator {

    private final WeatherValidationProperties properties;

    public boolean checkForDataAnomaly(WeatherRecordCreatedDto anomalyDto){
        boolean isAnomaly = false; //Anomaly represents unrealistic data connected to sensor failures

        if(anomalyDto.getTemperature() < properties.getTempMinimal() || anomalyDto.getTemperature() > properties.getTempMaximum()){
            log.warn("[DATA_ANOMALY] Temperature is unrealistic: {} ℃", anomalyDto.getTemperature());
            isAnomaly = true;

        }

        if(anomalyDto.getPressure() < properties.getPressureMinimal() || anomalyDto.getPressure() > properties.getPressureMaximum()){
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

        boolean isSpike = false; //Spike represents a sharp jump in data values

        if (Math.abs(newTemp - lastTemp) > properties.getTempSpikeLimit()) {
            log.warn("[DATA_SPIKE] Last temp read: {} ℃ Current temp read: {} ℃",
                    lastRecord.getTemperature(), weatherRecordDto.getTemperature());
            isSpike = true;
        }

        if (Math.abs(newPressure - lastPressure) > properties.getPressureSpikeLimit()) {
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
