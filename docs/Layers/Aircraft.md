---
title: Aircraft Layer
tags: [layer, aircraft, ads-b]
date: 2026-05-26
---

# Aircraft Layer

180 aircraft tracked globally via airplanes.live community ADS-B network. Each plane has its real-time lat/lon position + a callsign label rendered below it on the globe.

## Data source

**Primary: [airplanes.live](https://airplanes.live)** — free community ADS-B aggregator. No API key, no signup, sub-second responses worldwide.

Endpoint pattern:
```
GET https://api.airplanes.live/v2/point/{lat}/{lon}/{radius_nm}
```

Returns aircraft within the specified radius. Same response shape as ADSB.lol so it was a drop-in swap. See [[Bug Fixes/ADSB.lol replaced]].

**Fallback chain:**
1. airplanes.live (35 regional points, parallel fan-out)
2. OpenSky (6s timeout — rate-limited heavily for anonymous traffic)
3. ADSB.lol (12 regional points, sequential — kept as last resort)

## Regional fan-out

35 hub cities spanning every continent:

```
NORTH AMERICA (25):  Boston, NYC, Philadelphia, DC, Charlotte, Atlanta,
                     Miami, Tampa, New Orleans, Houston, Dallas, Kansas City,
                     Chicago, Detroit, Minneapolis, Denver, Salt Lake City,
                     Phoenix, Las Vegas, San Francisco, Los Angeles, Portland,
                     Seattle, Anchorage, Honolulu

CANADA (3):          Toronto, Montreal, Vancouver
MEXICO (1):          Mexico City
SOUTH AMERICA (6):   Bogota, Lima, Santiago, Sao Paulo, Rio, Buenos Aires
EUROPE (16):         London, Paris, Amsterdam, Frankfurt, Munich, Madrid,
                     Barcelona, Rome, Istanbul, Athens, Vienna, Warsaw,
                     Stockholm, Oslo, Moscow
MIDDLE EAST/AFRICA: Cairo, Tel Aviv, Riyadh, Dubai, Doha, Lagos, Nairobi,
                    Johannesburg, Casablanca
ASIA (12):           Mumbai, Delhi, Bangkok, Singapore, Jakarta, Manila,
                     Hong Kong, Shanghai, Beijing, Seoul, Tokyo, Osaka
OCEANIA (5):         Sydney, Melbourne, Brisbane, Perth, Auckland
```

Each point uses 150nm radius (or 200-250nm for less-covered areas like Honolulu, Anchorage, Lagos).

## Parallel execution

```python
with ThreadPoolExecutor(max_workers=16) as pool:
    futures = {pool.submit(fetch_region, p): p for p in points}
    for future in as_completed(futures):
        area, aircraft = future.result()
        if aircraft is None: continue
        # ... append to events
```

16 worker threads → 35 endpoints hit in parallel → total wall-clock ~2s.

## Per-region cap

To prevent NYC alone from filling the 600-plane cap:

```python
per_region_cap = max(3, AIRCRAFT_LIMIT // len(points) + 1)  # ~6 per region
```

Within each region, aircraft are randomly sampled (not first-N):
```python
if len(aircraft) > per_region_cap * 4:
    aircraft = random.sample(aircraft, per_region_cap * 4)
```

This gives a spatially-spread subset rather than a clustered airport-approach group.

## Total: 180 planes

- 30 regions × ~6 planes each = ~180 typical
- `AIRCRAFT_LIMIT = 180`

## Event shape

```python
{
    "id": "aircraft-alive-a01ec9",
    "layer": "aircraft",
    "source": "airplanes.live",
    "title": "UAL2461 aircraft track",
    "summary": "Chicago ADS-B aircraft. Altitude 34000 ft, ground speed 487 kt.",
    "severity": "low",
    "time": "2026-05-26T22:14:53+00:00",
    "lat": 41.3754,
    "lon": -87.2901,
    "url": "https://airplanes.live/",
    "details": {
        "Callsign": "UAL2461",
        "Registration": "N12345",
        "Aircraft type": "B739",
        "Altitude": "34000 ft",
        "Ground speed": "487 kt",
        "Heading": "247 deg",
        "ICAO24": "a01ec9",
        "Area": "Chicago",
    }
}
```

## Visual on the globe

- Sleek airplane silhouette icon (top-down view) at the position
- Callsign label sprite below the plane: e.g. "UAL2461" — drawn on a 256×64 canvas with cyan border
- Icon scale 0.072 (default marker size)
- Label scale (0.11, 0.028) — readable but not overwhelming

## Why airplanes.live (not OpenSky / ADSB.lol)

| API | Speed | Coverage | Auth |
|---|---|---|---|
| airplanes.live ✓ | sub-second | global | none |
| OpenSky | 12s timeout | global | rate-limit 429s |
| ADSB.lol | 3-5s | Western Hemisphere + EU only | none |

See [[Bug Fixes/ADSB.lol replaced]] for the verified head-to-head comparison.

## Related

- [[Bug Fixes/ADSB.lol replaced]]
- [[Bug Fixes/Aircraft clustering at hubs]]
- [[Features/3D Globe]]
