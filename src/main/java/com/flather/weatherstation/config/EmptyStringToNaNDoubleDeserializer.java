package com.flather.weatherstation.config;

import lombok.extern.slf4j.Slf4j;
import org.openapitools.jackson.nullable.JsonNullable;
import org.springframework.boot.jackson.JacksonComponent;
import tools.jackson.core.JacksonException;
import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.ValueDeserializer;

/**
 * Deserializes a sensor metric into {@link JsonNullable}, distinguishing the three states the
 * ingest contract defines (see the payload contract in README.md):
 *
 * <ul>
 *   <li>a number — the sensor took a reading
 *   <li>an explicit {@code null} — the sensor is fitted but failed to read, mapped to {@code NaN}
 *       so {@code DataQualityValidator} records it as {@code MISSING}
 *   <li>an absent field — no such sensor, left {@code undefined} so it records as {@code
 *       NOT_CONFIGURED}
 * </ul>
 *
 * <p>Anything outside that contract degrades to {@code NaN} — i.e. {@code MISSING} for that one
 * field — rather than throwing. MQTT ingest is a trust boundary: a deserializer exception
 * propagates out of {@code readValue} and {@code MqttConsumer} drops the <em>whole</em> reading, so
 * one unparseable field would cost every other metric in the payload. The warning log is what keeps
 * a misbehaving firmware visible.
 */
@Slf4j
@JacksonComponent
public class EmptyStringToNaNDoubleDeserializer extends ValueDeserializer<JsonNullable<Double>> {

  @Override
  public JsonNullable<Double> deserialize(JsonParser parser, DeserializationContext ctxt)
      throws JacksonException {

    JsonToken token = parser.currentToken();

    if (token == JsonToken.VALUE_NUMBER_FLOAT || token == JsonToken.VALUE_NUMBER_INT) {
      return JsonNullable.of(parser.getDoubleValue());
    }

    if (token == JsonToken.VALUE_STRING) {
      return fromString(parser, parser.getString());
    }

    // A structured value has to be consumed whole, or the parser is left mid-object and every
    // remaining field in the payload is read against the wrong tokens.
    if (token == JsonToken.START_OBJECT || token == JsonToken.START_ARRAY) {
      parser.skipChildren();
    }

    return unusable(parser, String.valueOf(token));
  }

  /**
   * {@code Double.valueOf} accepts the {@code "NaN"} and {@code "Infinity"} spellings, both of
   * which the validator already resolves to {@code MISSING}. Everything it rejects — {@code "n/a"},
   * {@code "--"}, a locale-formatted {@code "21,5"} — is a contract violation, not a value.
   */
  private JsonNullable<Double> fromString(JsonParser parser, String raw) {
    String trimmed = raw.trim();

    if (trimmed.isEmpty()) {
      return JsonNullable.of(Double.NaN);
    }

    try {
      return JsonNullable.of(Double.valueOf(trimmed));
    } catch (NumberFormatException e) {
      return unusable(parser, "\"" + raw + "\"");
    }
  }

  private JsonNullable<Double> unusable(JsonParser parser, String rendered) {
    log.warn(
        "[PAYLOAD_UNPARSEABLE][{}] {} is not a number — recording the field as missing",
        parser.currentName(),
        rendered);

    return JsonNullable.of(Double.NaN);
  }

  @Override
  public JsonNullable<Double> getNullValue(DeserializationContext ctxt) {
    return JsonNullable.of(Double.NaN);
  }

  @Override
  public JsonNullable<Double> getAbsentValue(DeserializationContext ctxt) {
    return JsonNullable.undefined();
  }
}
