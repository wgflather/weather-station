package com.flather.weatherstation.dto.analytics;

import com.flather.weatherstation.domain.constant.BeaufortScale;
import com.flather.weatherstation.domain.constant.WindDirectionLabel;

public record WindDto(
    Double speed,
    Double gusts,
    Double direction,
    WindDirectionLabel directionLabel,
    BeaufortScale beaufort,
    MetricDataDetails metricDataDetails) {}
