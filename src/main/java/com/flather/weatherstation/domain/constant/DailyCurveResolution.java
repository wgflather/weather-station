package com.flather.weatherstation.domain.constant;

import lombok.Getter;

@Getter
public enum DailyCurveResolution {
    CARD(10),
    FULL_CHART(1);

    private final int stepSize;

    DailyCurveResolution(int stepSize){
        this.stepSize = stepSize;
    }
}
