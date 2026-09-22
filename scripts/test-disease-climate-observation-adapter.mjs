import assert from "node:assert/strict";
import { adaptAgroclimateSnapshotToDiseaseObservation } from "../src/domain/disease-climate-observation-adapter.ts";

const observation=adaptAgroclimateSnapshotToDiseaseObservation({
  metrics:{
    DAY_MEAN_TEMP_C:22,
    NIGHT_MEAN_TEMP_C:18,
    DEW_POINT_C:17,
    RELATIVE_HUMIDITY_PCT:94,
    VPD_KPA:0.35,
    LEAF_WETNESS_HOURS:11,
    PRECIPITATION_MM:26,
    PRECIPITATION_INTENSITY_MM_H:5.5,
    CONTINUOUS_RAIN_HOURS:50,
    CONSECUTIVE_WET_DAYS:4,
    SOIL_MOISTURE_PCT:78,
    WIND_KMH:13,
    WIND_GUST_KMH:28,
    SUNSHINE_HOURS:3,
    CLOUD_COVER_PCT:88,
  },
  lowRadiationSignal:true,
});

assert.deepEqual(observation,{
  airTemperatureC:22,
  nightTemperatureC:18,
  dewPointC:17,
  relativeHumidityPct:94,
  vpdKpa:0.35,
  leafWetnessHours:11,
  rainfallMm:26,
  rainfallIntensityMmH:5.5,
  continuousRainHours:50,
  consecutiveWetDays:4,
  soilMoisturePct:78,
  windKmh:13,
  windGustKmh:28,
  sunshineHours:3,
  cloudCoverPct:88,
  lowRadiationSignal:true,
});

const sparse=adaptAgroclimateSnapshotToDiseaseObservation({
  metrics:{CONTINUOUS_RAIN_HOURS:48},
});
assert.equal(sparse.continuousRainHours,48);
assert.equal(sparse.airTemperatureC,null);
assert.equal(sparse.lowRadiationSignal,null);

console.log("disease-climate-observation-adapter: snapshot canônico chega ao motor sem inferências");
