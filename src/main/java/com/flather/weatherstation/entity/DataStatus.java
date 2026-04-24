package com.flather.weatherstation.entity;

import lombok.Getter;

@Getter
public enum DataStatus {
    LIVE,
    DELAYED,
    STALE,
    OFFLINE,
    EMPTY;

}
