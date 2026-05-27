---
title: Bug — Satellite API hanging
tags: [bug, backend, network]
date: 2026-05-26
---

# Bug · Satellite API hanging

**Symptom**: `/api/satellites` taking 25+ seconds, sometimes never resolving. This cascaded to break `loadEvents()` and the camera grid — see [[Bug Fixes/Camera grid not rendering]].

## Root cause

The satellite endpoint pre-fetches TLE data for 30 satellites from external APIs:

```python
SATELLITE_IDS = [25544, 20580, 25338, ..., 48277]  # 30 IDs

for sat_id in SATELLITE_IDS:
    try:
        item = fetch_json(f"https://tle.ivanstanojevic.me/api/tle/{sat_id}", timeout=6)
        if item.get("line1") and item.get("line2"):
            satellites.append({...})
    except Exception:
        continue
if len(satellites) < 6:
    text = fetch_text("https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle", timeout=12)
    satellites = parse_tle(text, 120)
```

Worst case: 30 sats × 6s timeout = 180s sequential, plus 12s CelesTrak fallback. The TLE API got flaky and started hanging on the read side (TCP held open, server never sends body).

## Fix (frontend-side)

`safeFetch` wrapper in `loadEvents()` gives the satellite request a 12s hard deadline:

```js
safeFetch(`/api/satellites?ts=${Date.now()}`, 12000)
```

After 12s, the fetch resolves to `null` regardless of what the server is doing. Client doesn't hang.

Server-side, the request continues to completion (server processes are independent of client connections), so the next `/api/satellites` call benefits from the now-populated `satellite_cache` (5-minute TTL).

## Fix (backend potential improvement)

Not yet implemented but could parallelize the TLE fetches:

```python
# Hypothetical
def fetch_tle(sat_id):
    try:
        return fetch_json(f"https://tle.ivanstanojevic.me/api/tle/{sat_id}", timeout=3)
    except Exception:
        return None

with ThreadPoolExecutor(max_workers=16) as pool:
    results = list(pool.map(fetch_tle, SATELLITE_IDS))
satellites = [r for r in results if r and r.get("line1")]
```

Would drop worst-case from 180s sequential to ~3s parallel. Not needed for now since the 5-min cache means the first call's slowness is amortized.

## Lesson

External APIs WILL hang at the TCP read level eventually — `timeout=` parameters in `urllib.request.urlopen` cover connect + first byte, but not subsequent reads. Always pair server-side timeouts with client-side `Promise.race` deadlines for true robustness.

## Related

- [[Bug Fixes/Camera grid not rendering]]
- [[Architecture/Backend Server]]
- [[Layers/All Other Layers]]
