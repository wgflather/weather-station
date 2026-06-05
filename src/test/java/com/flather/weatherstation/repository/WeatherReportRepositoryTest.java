package com.flather.weatherstation.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.flather.weatherstation.controller.WeatherController;
import com.flather.weatherstation.dto.weather.WeatherRecordCreatedDto;
import com.flather.weatherstation.domain.constant.DataQuality;
import com.flather.weatherstation.domain.entity.WeatherRecord;
import com.flather.weatherstation.service.WeatherService;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.ObjectMapper;

@AutoConfigureMockMvc
@SpringBootTest
@ActiveProfiles("testcontainers")
@Testcontainers
class WeatherReportRepositoryTest {

  @Container @ServiceConnection
  static PostgreSQLContainer container =
      new PostgreSQLContainer(DockerImageName.parse("postgres:15.1"));

  @Autowired WeatherReportRepository repository;

  @Autowired WeatherService service;

  @Autowired ObjectMapper mapper;

  @Autowired MockMvc mockMvc;

  @BeforeEach
  void setup() {
    repository.deleteAll();
  }

  @Test
  void saveNewRecordWithOkDataQuality() throws Exception {
    WeatherRecordCreatedDto createdDto =
        WeatherRecordCreatedDto.builder()
            .temperature(10)
            .pressure(1000)
            .measuredAt(Instant.now().truncatedTo(ChronoUnit.SECONDS))
            .build();

    mockMvc
        .perform(
            post(WeatherController.BASE_PATH)
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(createdDto)))
        .andExpect(status().isNoContent());

    assertThat(repository.findAll()).hasSize(1);

    WeatherRecord record = repository.findAll().get(0);

    assertThat(record.getTemperature()).isEqualTo(createdDto.getTemperature());
    assertThat(record.getPressure()).isEqualTo(createdDto.getPressure());
    assertThat(record.getMeasuredAt()).isEqualTo(createdDto.getMeasuredAt());

    assertThat(record.getDataQuality()).isEqualTo(DataQuality.OK);
  }

  @Test
  void testDataQualitySpikeCondition() throws Exception {
    Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
    WeatherRecordCreatedDto createdFirstRecord =
        WeatherRecordCreatedDto.builder().temperature(10).pressure(1000).measuredAt(now).build();

    WeatherRecordCreatedDto spikedDto =
        WeatherRecordCreatedDto.builder()
            .temperature(25)
            .pressure(1000)
            .measuredAt(now.plusSeconds(60))
            .build();

    mockMvc
        .perform(
            post(WeatherController.BASE_PATH)
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(createdFirstRecord)))
        .andExpect(status().isNoContent());

    mockMvc
        .perform(
            post(WeatherController.BASE_PATH)
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(spikedDto)))
        .andExpect(status().isNoContent());

    List<WeatherRecord> records =
        repository.findAll().stream()
            .sorted(Comparator.comparing(WeatherRecord::getMeasuredAt))
            .toList();

    assertThat(records).hasSize(2);

    assertThat(records.get(0).getDataQuality()).isEqualTo(DataQuality.OK);
    assertThat(records.get(1).getDataQuality()).isEqualTo(DataQuality.SPIKE);
  }

  @Test
  void testDataQualityTemperatureAnomaly() throws Exception {
    WeatherRecordCreatedDto createdDto =
        WeatherRecordCreatedDto.builder()
            .temperature(100)
            .pressure(1000)
            .measuredAt(Instant.now().truncatedTo(ChronoUnit.SECONDS))
            .build();

    mockMvc
        .perform(
            post(WeatherController.BASE_PATH)
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(createdDto)))
        .andExpect(status().isNoContent());

    assertThat(repository.findAll()).hasSize(1);

    WeatherRecord record = repository.findAll().get(0);

    assertThat(record.getDataQuality()).isEqualTo(DataQuality.ANOMALY);
  }
}
