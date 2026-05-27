---
title: Backend Server
tags: [architecture, backend, python]
date: 2026-05-26
---

# Backend Server

> Python 3.12 standard library only. No pip dependencies. ~1,600 lines.

## Server skeleton

```python
PORT = int(os.environ.get("PORT", "8000"))

class MatrixHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        # /api/* endpoints — handled inline below
        # everything else falls through to SimpleHTTPRequestHandler
        # which serves index.html, app.js, styles.css, vendor/, assets/...

def main():
    server = ThreadingHTTPServer(("0.0.0.0", PORT), MatrixHandler)
    server.serve_forever()
```

`ThreadingHTTPServer` so each request runs in its own thread — important because some endpoints fan out to 16 parallel upstream API calls via `ThreadPoolExecutor`.

## Caches

5 module-level dicts with per-endpoint TTL:

| Cache | TTL | What it holds |
|---|---|---|
| `cache` | 55s | Full `/api/events` payload (all data layers) |
| `satellite_cache` | 300s | TLE list for client-side propagation |
| `news_cache` | 45s | Parsed RSS items, category-balanced |
| `intel_cache` | 90s | Crypto, FX, Wikipedia, APOD, SpaceX, HN |
| `videos_ai_cache` | 300s | AI YouTube videos (48h window) |
| `videos_gaming_cache` | 300s | POE2 YouTube videos (24h window) |

Pattern:

```python
def build_news_payload():
    now = time.time()
    if news_cache["payload"] and now - news_cache["at"] < NEWS_CACHE_TTL_SECONDS:
        return news_cache["payload"]
    # ... fetch + build
    news_cache["at"] = now
    news_cache["payload"] = payload
    return payload
```

## Parallel fetch

The aircraft loader uses `ThreadPoolExecutor(max_workers=16)` to hit 35 regional `airplanes.live` endpoints simultaneously. Reduced cold-load from ~140s sequential to ~2s parallel.

```python
def fetch_region(point):
    area, lat, lon, radius = point
    try:
        data = fetch_json(f"https://api.airplanes.live/v2/point/{lat}/{lon}/{radius}", timeout=3)
        return area, data.get("ac") or []
    except Exception:
        return area, None

with ThreadPoolExecutor(max_workers=16) as pool:
    futures = {pool.submit(fetch_region, p): p for p in points}
    region_results = [f.result() for f in as_completed(futures)]
```

Same pattern in `build_videos_payload()` for YouTube channel feeds.

## HTTP helpers

### `fetch_json(url, timeout=8)`
- `urllib.request.urlopen` with `User-Agent: MatrixAIIntelligence/1.0`
- Raises on HTTPError / TimeoutError / OSError
- All loaders wrap in try/except and either skip or fall back

### `fetch_text(url, timeout=8)`
- Same as `fetch_json` but returns raw string
- **Browser User-Agent override** for sites that block stock urllib (Chrome 120 on macOS)
- **Subprocess curl fallback** on `HTTPError`: shell out to `curl -fsSL -A "Mozilla/5.0" ...` — needed because some endpoints (Reuters, Defense News) reject urllib by TLS fingerprint

### `subprocess.run(["curl", ...])` direct
- Used for `/api/tts` endpoint
- Google Translate TTS returns 401 to urllib but 200 to curl with browser UA
- Curl is in Railway's nixpacks setup (`nixPkgs = ["python312", "curl"]`)

## Endpoint inventory

See [[APIs/Internal Endpoints]] for the full table.

| Endpoint | Cache | What it does |
|---|---|---|
| `/api/events` | 55s | Aggregates 11 geo-tagged data loaders |
| `/api/satellites` | 300s | TLE list for client-side propagation |
| `/api/cameras` | static | The 5 Bay Area YouTube embeds |
| `/api/camera-preview` | static SVG | Generated SVG placeholder |
| `/api/news` | 45s | 23-source RSS aggregation with category cap |
| `/api/intel` | 90s | Crypto + FX + HN + Wikipedia + APOD + SpaceX |
| `/api/videos/ai` | 300s | YouTube AI feeds, keyword-filtered |
| `/api/videos/gaming` | 300s | YouTube POE2 feeds, keyword-filtered |
| `/api/tts` | client-side 5min | Google TTS proxy (en-GB female) |

## Loaders that run on every `/api/events` cold-load

```python
for loader in (
    load_usgs,           # USGS M2.5+ daily quake feed
    load_emsc_seismic,   # EMSC global seismic
    load_geonet_quakes,  # NZ GeoNet
    load_gdacs,          # GDACS active disasters
    load_eonet,          # NASA EONET (all categories)
    load_volcano_eonet,  # NASA EONET filtered to volcanoes
    load_wildfire_eonet, # NASA EONET filtered to wildfires
    load_nhc_storms,     # NOAA NHC active tropical cyclones
    load_space_weather,  # NOAA SWPC alerts
    load_weather_alerts, # NOAA NWS active alerts
    load_live_weather,   # Open-Meteo current conditions × 12 cities
    load_air_quality,    # Open-Meteo AQ × 12 cities
    load_ocean_levels,   # NOAA CO-OPS water levels × 5 stations
    load_marine_weather, # Open-Meteo marine × 6 zones
    load_aircraft,       # airplanes.live with regional fan-out
    load_iss_position,   # Where the ISS at
    load_cameras,        # Static Bay Area camera list
):
    try:
        loader(events, sources)
    except (URLError, TimeoutError, OSError, ...):
        errors.append(f"{loader.__name__}: ...")
```

## Filtering / shaping

- `add_event()` — validates lat/lon, deduplicates by id
- `severity_from_magnitude()` — M<3 = low, M<5 = medium, M≥5 = high
- `CALIFORNIA_BREAKING_RE` — keyword filter applied to CA-category news
- `AI_VIDEO_KEYWORDS` — keyword filter for AI YouTube videos
- `GAMING_VIDEO_KEYWORDS` — POE2-only filter for gaming YouTube
- Category caps: `{"ai": 26, "california": 6, default: 14}` in news payload
- Aircraft per-region cap: ~6 per region, ~180 total

## Related

- [[Architecture/System Overview]]
- [[APIs/Internal Endpoints]]
- [[APIs/External APIs]]
- [[Bug Fixes/Satellite API hanging]]
