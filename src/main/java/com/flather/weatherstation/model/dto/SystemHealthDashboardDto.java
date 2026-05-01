package com.flather.weatherstation.model.dto;


import com.flather.weatherstation.model.constant.DataStatus;
import lombok.*;

import java.time.ZonedDateTime;

@Data
@Builder
@AllArgsConstructor
@RequiredArgsConstructor
public class SystemHealthDashboardDto {
    private ZonedDateTime lastMeasuredAt;
    private long lagMinutes;
    private long recordsToday;
    private DataStatus status;
}
