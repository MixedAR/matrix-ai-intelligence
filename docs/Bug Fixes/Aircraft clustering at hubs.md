---
title: Bug — Aircraft clustering at hubs
tags: [bug, aircraft, data]
date: 2026-05-26
---

# Bug · Aircraft clustering at hubs

**Symptom**: 600 aircraft markers were all piled at NYC and a few major US airports. No coverage in Europe, Asia, or anywhere outside North America. User: *"the planes are all in one place and they should be displayed in there current position."*

## Root cause

The ADSB.lol loader iterated through a list of regional points (NYC, London, Tokyo, etc.) but had a single global counter:

```python
points = [
    ("New York", 40.7128, -74.0060, 250),    # 250nm radius
    ("London", 51.5074, -0.1278, 250),
    ("Tokyo", 35.6762, 139.6503, 250),
    ...
]

for area, lat, lon, radius in points:
    data = fetch_json(f".../v2/point/{lat}/{lon}/{radius}", timeout=10)
    for item in data.get("ac") or []:
        ...
        added += 1
        if added >= AIRCRAFT_LIMIT:  # 600
            return                    # ← bailed out after NYC
```

NYC at 250nm radius returns 800+ live aircraft. The loop hit `AIRCRAFT_LIMIT` (600) before reaching London, Tokyo, LA, or anywhere else.

## Fix (three layers)

### 1. Per-region cap

```python
per_region_cap = max(3, AIRCRAFT_LIMIT // len(points) + 1)  # ~6 per region
```

Each region contributes at most ~6 aircraft. With 35 regions, total ~180 planes distributed globally.

### 2. Random sampling within each region

Even after per-region cap, the first N aircraft returned by ADSB.lol are typically the densest airport-approach planes near the center of the search radius — visually they cluster around runways.

```python
if len(aircraft) > per_region_cap * 4:
    aircraft = random.sample(aircraft, per_region_cap * 4)
```

Pick 4× the cap at random, then take the first 6 of those. The random shuffle ensures spatial spread within each region's 150nm radius.

### 3. Smaller radius

Dropped from 250nm → 150nm. Each region now covers a tighter geographic area, so the visual is less of a tight cluster at major airports.

### 4. Expanded region list

From 12 broad regions → **35 hubs across every continent**:
- 25 US cities (Boston, NYC, DC, Atlanta, Chicago, Denver, Phoenix, SF, LA, Seattle, Anchorage, Honolulu, etc.)
- 3 Canada (Toronto, Montreal, Vancouver)
- 1 Mexico (Mexico City)
- 6 South America (Bogota, Lima, Santiago, Sao Paulo, Rio, Buenos Aires)
- 16 Europe (London, Paris, Frankfurt, Madrid, Rome, Istanbul, Moscow, Stockholm, etc.)
- 9 Middle East / Africa (Cairo, Tel Aviv, Riyadh, Dubai, Doha, Lagos, Nairobi, Johannesburg, Casablanca)
- 12 Asia (Mumbai, Delhi, Bangkok, Singapore, Tokyo, Seoul, Beijing, Shanghai, HK, Manila, Jakarta, Osaka)
- 5 Oceania (Sydney, Melbourne, Brisbane, Perth, Auckland)

## Performance fix (parallel fan-out)

35 sequential ADSB.lol calls would take ~140 seconds at 4s timeout each. Parallelized via `ThreadPoolExecutor(max_workers=16)`:

```python
def fetch_region(point):
    area, lat, lon, radius = point
    try:
        data = fetch_json(f".../v2/point/{lat}/{lon}/{radius}", timeout=4)
        return area, data.get("ac") or []
    except Exception:
        return area, None

with ThreadPoolExecutor(max_workers=16) as pool:
    futures = {pool.submit(fetch_region, p): p for p in points}
    region_results = [f.result() for f in as_completed(futures)]
```

Result: wall-clock from 140s sequential → **~2s parallel**.

## Verification

After fix, `/api/events` aircraft distribution:

```
by region:
  London         6
  Paris          6
  Frankfurt      6
  Tokyo          6
  Singapore      6
  Sydney         6
  Sao Paulo      6
  New York       6
  Los Angeles    6
  Chicago        6
  ... (30+ regions)
total: 180 aircraft
```

Globally spread, with realistic per-region densities (some Asian regions add later from cache as that API region warms up).

## Related

- [[Layers/Aircraft]]
- [[Bug Fixes/ADSB.lol replaced]]
