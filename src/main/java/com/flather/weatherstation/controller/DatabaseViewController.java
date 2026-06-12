package com.flather.weatherstation.controller;

import com.flather.weatherstation.domain.constant.DataQuality;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.domain.entity.WeatherRecord;
import com.flather.weatherstation.service.DatabaseRawViewService;
import lombok.AllArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@AllArgsConstructor
@RequestMapping("/api/admin")
public class DatabaseViewController {
    private final DatabaseRawViewService service;
    @GetMapping("/records")
    public Page<WeatherRecord> getWeatherRecords(
            @RequestParam(value = "quality", required = false) DataQuality quality,
            @RequestParam(value = "all", defaultValue = "true") boolean all,
            @RequestParam(value = "metric", required = false) Metric metric,
            @PageableDefault(size = 50, sort = "measuredAt", direction = Sort.Direction.DESC) Pageable pageable){
        return service.getRecords(all, quality, pageable, metric);
    }

    @DeleteMapping("/records/{id}")
    public ResponseEntity<Void> deleteRecord(@PathVariable Long id){

        boolean isDeleted = service.deleteRecord(id);

        if (isDeleted) {
            return ResponseEntity.ok().build(); // Status 200 OK
        } else {
            return ResponseEntity.notFound().build(); // Status 404 Not Found
        }

    }


}
