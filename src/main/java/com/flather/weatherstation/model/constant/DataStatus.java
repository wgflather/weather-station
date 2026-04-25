package com.flather.weatherstation.model.constant;

import lombok.Getter;

@Getter
public enum DataStatus {
    LIVE,
    DELAYED,
    STALE,
    OFFLINE,
    EMPTY;

}
