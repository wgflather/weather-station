package com.flather.weatherstation.repository;

import com.flather.weatherstation.domain.entity.StationConfiguration;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface StationConfigurationRepository extends JpaRepository<StationConfiguration, Long> {
  Optional<StationConfiguration> findById(Long id);
}
