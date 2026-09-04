package com.flather.weatherstation.repository;

import com.flather.weatherstation.domain.constant.DayPeriod;
import com.flather.weatherstation.domain.entity.DayPeriodMetrics;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface DailyWeatherRecordRepository extends JpaRepository<DayPeriodMetrics, Long> {

  List<DayPeriodMetrics> findByDateBetweenOrderByDateAsc(LocalDate from, LocalDate to);

  List<DayPeriodMetrics> findByDate(LocalDate date);

  Optional<DayPeriodMetrics> findByDateAndPeriod(LocalDate date, DayPeriod period);

  // DISTINCT because each date now has up to three rows (FULL / DAY / NIGHT) and callers want the
  // dates that have data, not one entry per period.
  @Query(
      "SELECT DISTINCT d.date FROM DayPeriodMetrics d WHERE d.date BETWEEN :from AND :to ORDER BY d.date DESC")
  List<LocalDate> findDatesBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
