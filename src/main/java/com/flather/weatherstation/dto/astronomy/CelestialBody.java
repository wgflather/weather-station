package com.flather.weatherstation.dto.astronomy;

import io.github.cosinekitty.astronomy.Body;

public enum CelestialBody {
  SUN,
  MOON;

  public Body toLibraryBody() {
    return switch (this) {
      case SUN -> Body.Sun;
      case MOON -> Body.Moon;
    };
  }
}
