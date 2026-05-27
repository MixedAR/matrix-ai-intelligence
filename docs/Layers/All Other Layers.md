---
title: All Other Layers
tags: [layer, reference]
date: 2026-05-26
---

# All Other Layers

Reference for the 8 remaining globe layers besides aircraft + earthquakes.

## Disasters

Global active disasters from **GDACS** (geoglobal.gdacs.org) + **NOAA NHC** active tropical cyclones.

- GDACS: floods, droughts, cyclones, volcanoes, earthquakes with alert level (Green/Orange/Red)
- NHC: active hurricanes / tropical storms with name, classification, basin, intensity, pressure

Icon resolves by event-type keywords — flood → wave glyph, cyclone → spiral, drought → sun + cracks, generic → warning triangle.

## Natural Events

**NASA EONET** (`eonet.gsfc.nasa.gov/api/v3/events`) split into 3 sub-loaders:
- `load_eonet` — all open natural events
- `load_volcano_eonet` — `category=volcanoes&status=open` (high severity)
- `load_wildfire_eonet` — `category=wildfires&status=open` (high severity)

Per-event icon: volcano = mountain + lava plume, wildfire = gradient flame, ice = snowflake, generic = warning triangle.

## Weather Alerts

**NOAA/NWS Active Alerts** — `api.weather.gov/alerts/active?status=actual&message_type=alert`. Returns weather warnings (severe thunderstorm, tornado, flood, blizzard, fire weather, etc.) with severity (extreme/severe/moderate/minor).

Geometry can be polygon — we average to a center point. Severity maps:
- extreme/severe → high
- moderate → medium
- everything else → low

## Live Weather

**Open-Meteo Forecast API** (`api.open-meteo.com/v1/forecast`). 12 cities sampled simultaneously in a single multi-location call:

```
NYC, London, Tokyo, Singapore, Sydney, Dubai, Sao Paulo,
Johannesburg, LA, Mexico City, Anchorage, Honolulu
```

Returns: temperature, precipitation, weather code, wind speed/direction. Mapped to friendly text ("Light rain", "Thunderstorm", "Clear") via `weather_text()`.

Severity is medium if precip > 0 or wind > 35 km/h, else low.

## Air Quality

**Open-Meteo Air Quality API** (`air-quality-api.open-meteo.com/v1/air-quality`). Same 12 cities. Returns US AQI, PM2.5, PM10, ozone, NO2, CO.

Severity:
- AQI ≥ 151 → high
- AQI ≥ 51 → medium
- else → low

## Space Weather

**NOAA SWPC** (`services.swpc.noaa.gov/products/alerts.json`). Solar flares, geomagnetic storms, radiation events. Plotted at NOAA SWPC HQ (39.74, -105.18) since these are global phenomena.

Icon: sun corona with rays.

## Satellites

Two sources:

### TLE-based (CelesTrak / TLE API)
30 named satellites (ISS, Hubble, NOAA-19, Sentinel, Landsat, Starlink samples, etc.) — TLEs fetched server-side, propagation done **client-side** via vendored `satellite.js`:

```js
const satrec = twoline2satrec(line1, line2);
const positionAndVelocity = propagate(satrec, now);
const geodetic = eciToGeodetic(positionAndVelocity.position, gstime(now));
const lat = degreesLat(geodetic.latitude);
const lon = degreesLong(geodetic.longitude);
```

Recomputed every 15 seconds so satellites visibly move across the globe.

### ISS live position (Where the ISS at)
`api.wheretheiss.at/v1/satellites/25544` — separate from TLE propagation, ground truth API. Single marker with detailed metadata (altitude, velocity, visibility, footprint).

## Ocean

Two sources:

### NOAA CO-OPS (5 US stations)
- `api.tidesandcurrents.noaa.gov` — water levels at NYC Harbor, San Francisco Bay, Seattle, Honolulu, Key West
- Latest measurement relative to MLLW datum

### Open-Meteo Marine (6 ocean zones)
- `marine-api.open-meteo.com/v1/marine` — wave height, period, current velocity, sea surface temp
- North Atlantic, North Pacific, Gulf of Mexico, Mediterranean, Tasman Sea, Indian Ocean

Severity is medium if wave height ≥ 3m.

## Cameras

See [[Features/Live Cameras]].

## Related

- [[Layers/Earthquakes]]
- [[Layers/Aircraft]]
- [[APIs/External APIs]]
