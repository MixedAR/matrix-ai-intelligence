---
title: Bug — ADSB.lol → airplanes.live swap
tags: [bug, aircraft, api]
date: 2026-05-26
---

# Bug · ADSB.lol replaced with airplanes.live

**Symptom**: aircraft tracking unreliable. ADSB.lol's coverage outside the Western Hemisphere was poor, and even regional calls would frequently time out. Aircraft layer often showed 0 planes after a refresh.

## Investigation

Head-to-head comparison of free community ADS-B aggregators:

| Region | airplanes.live | ADSB.lol |
|---|---|---|
| New York | 1051 aircraft / 1.3s | 600+ / 1.0s |
| Tokyo | 27 aircraft / 444ms | timeout (6s+) |
| Sydney | 49 / 469ms | timeout |
| São Paulo | 94 / 642ms | timeout |
| Nairobi | 5 / 349ms | timeout |
| Dubai | 26 / 268ms | 1-2s |
| Singapore | 26 / 305ms | 5s |

ADSB.lol's coverage is mostly Western Hemisphere + Europe; most other continents timed out from US servers.

## Fix

Swapped primary source to **airplanes.live** with same API shape so the swap was nearly drop-in:

```
OLD: https://api.adsb.lol/v2/point/{lat}/{lon}/{radius}
NEW: https://api.airplanes.live/v2/point/{lat}/{lon}/{radius}
```

Both return `{ "ac": [...] }` with the same per-aircraft fields:
- `hex` → ICAO24
- `flight` → callsign
- `r` → registration
- `t` → aircraft type
- `lat`, `lon`, `alt_baro`, `gs`, `track`

Implementation:

```python
def load_aircraft(events, sources):
    if _load_airplanes_live(events, sources):
        return
    # Fallback 1: OpenSky (rate-limited)
    data = None
    try:
        data = fetch_json("https://opensky-network.org/api/states/all", timeout=6)
    except Exception:
        data = None
    if not data or not (data.get("states") or []):
        load_adsb_lol_aircraft(events, sources)
        return
    # ... process OpenSky data
```

So the precedence chain is:
1. **airplanes.live** — primary, fast, global
2. **OpenSky** — secondary, rate-limited
3. **ADSB.lol** — fallback, limited coverage

## Why airplanes.live wins

- **Sub-second responses** even for Tokyo, Sydney, Sao Paulo, Nairobi
- **Truly global coverage** — community feeders worldwide
- **No API key, no signup** — anonymous traffic accepted
- **No rate-limiting** observed in our usage
- **Same response shape** as ADSB.lol — minimal code changes

## What didn't work

- `airplanes.live/v2/all` — returns empty
- `airplanes.live/v2/mil` (military) — empty / unreliable
- `airplanes.live/v2/ladd` (limited aircraft data display) — empty

Stuck with `/v2/point/{lat}/{lon}/{radius}` regional queries.

## Verification

After swap, `/api/events` aircraft count:

```
aircraft total: 180
sources contain airplanes.live: True
lat range: -33.9 to 61.2
lon range: -157.9 to 174.8
```

Truly global. See [[Layers/Aircraft]] for the full regional fan-out.

## Related

- [[Layers/Aircraft]]
- [[Bug Fixes/Aircraft clustering at hubs]]
