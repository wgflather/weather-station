package com.flather.weatherstation.model.constant;

import lombok.Data;
import lombok.Getter;

@Getter
public enum DataStatus {
    LIVE,
    DELAYED,
    STALE,
    OFFLINE,
    EMPTY;

    public static DataStatus fromLag(long lagMinutes){
        if(lagMinutes < 5){
            return DataStatus.LIVE;
        } else if (lagMinutes < 10) {
            return DataStatus.DELAYED;
        } else if (lagMinutes < 1440) {
            return DataStatus.STALE;
        } else {
            return DataStatus.OFFLINE;
        }
    }
}
