---
title: Earthquake Layer
tags: [layer, seismic, geology]
date: 2026-05-26
---

# Earthquake Layer

3 independent seismic networks aggregated, all filtered to **M ≥ 2.5**.

## Sources

| Source | Endpoint | Coverage |
|---|---|---|
| **USGS** | `earthquake.usgs.gov/.../2.5_day.geojson` | US + global "felt" events |
| **EMSC** | `seismicportal.eu/fdsnws/event/1/query` | European-Mediterranean Seismological Centre |
| **GeoNet NZ** | `api.geonet.org.nz/quake?MMI=3` | New Zealand-specific high-resolution |

## Magnitude filter

User explicitly requested only M ≥ 2.5+. Filter applied in all 3 loaders:

```python
magnitude = props.get("mag")
if magnitude is None or magnitude < 2.5:
    continue
```

USGS feed switched from `all_day.geojson` → `2.5_day.geojson` so upstream is pre-filtered (the M<2.5 micro-quakes are excluded server-side too).

## Severity coloring

```python
def severity_from_magnitude(magnitude):
    if magnitude is None: return "medium"
    if magnitude >= 5: return "high"
    if magnitude >= 3: return "medium"
    return "low"
```

- M ≥ 5 → high severity → larger pulsing marker, red border in alerts feed
- M 3-5 → medium → standard
- M 2.5-3 → low

## Marker icon

Concentric pulse rings with center dot (animated breathing scale) — matches the seismic-wave aesthetic. Red #ff3d4f.

## Event shape

```python
{
    "id": "usgs-us7000n4tt",
    "layer": "earthquake",
    "source": "USGS Earthquake",
    "title": "M 3.4 - 14km SW of Anza, CA",
    "summary": "Magnitude 3.4 seismic activity reported by USGS.",
    "severity": "medium",
    "time": "2026-05-26T22:14:53+00:00",
    "lat": 33.456, "lon": -116.789,
    "url": "https://earthquake.usgs.gov/...",
    "details": {
        "Magnitude": 3.4,
        "Depth": "12.5 km",
        "Place": "14km SW of Anza, CA",
        "Status": "automatic",
        "Tsunami": "No",
    }
}
```

## Volumes

Typical live state shows ~100-200 quakes:
- USGS: 50-100/day
- EMSC: 30-80/day
- GeoNet NZ: 10-30/day filtered to MMI ≥ 3

After de-duplication (some quakes are reported by multiple networks with different IDs), ~100-180 markers on the globe at any time.

## Related

- [[APIs/External APIs]]
- [[Features/3D Globe]]
