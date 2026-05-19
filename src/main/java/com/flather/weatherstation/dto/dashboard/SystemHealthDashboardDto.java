package com.flather.weatherstation.dto.dashboard;

import com.flather.weatherstation.model.constant.DataStatus;
import java.time.ZonedDateTime;
import lombok.*;

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
