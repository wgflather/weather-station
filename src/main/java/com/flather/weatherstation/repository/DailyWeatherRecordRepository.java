package com.flather.weatherstation.repository;

import com.flather.weatherstation.domain.entity.DailyWeatherRecord;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface DailyWeatherRecordRepository extends JpaRepository<DailyWeatherRecord, Long> {

  List<DailyWeatherRecord> findByDateBetweenOrderByDateAsc(LocalDate from, LocalDate to);

  Optional<DailyWeatherRecord> findByDate(LocalDate date);

  @Query(
      "SELECT d.date FROM DailyWeatherRecord d WHERE d.date BETWEEN :from AND :to ORDER BY d.date DESC")
  List<LocalDate> findDatesBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
