---
title: Internal Endpoints
tags: [apis, server, reference]
date: 2026-05-26
---

# Internal Endpoints

All exposed by `matrix_server.py`. The frontend hits exactly these — no other URLs.

## `/api/events`

**TTL**: 55 seconds (in-memory cache).
**Cold-load**: ~16-30 seconds the first time (depends on upstream latency).
**Subsequent**: <100ms cache hit.

Returns combined geo-tagged events from 17 loaders. Shape:

```json
{
  "updated_at": "2026-05-26T22:14:53+00:00",
  "sources": ["USGS Earthquake", "EMSC", "GeoNet NZ", "GDACS", "NASA EONET", ...],
  "errors": [],
  "events": [
    { "id": "...", "layer": "earthquake", "title": "...", "lat": 33.4, "lon": -116.7, ... }
  ]
}
```

Truncated to first 1200 events (after sort by time desc).

## `/api/satellites`

**TTL**: 300 seconds.
Returns TLE list for client-side propagation:

```json
{
  "updated_at": "...",
  "sources": ["TLE API"],
  "satellites": [
    { "name": "ISS (ZARYA)", "line1": "1 25544U ...", "line2": "2 25544 ..." }
  ]
}
```

30 named satellites tried via TLE API individually, falls back to CelesTrak bulk feed if <6 succeed.

Client uses vendored `satellite.js` to compute current sub-points every 15 seconds.

## `/api/cameras`

**TTL**: static (5 cameras hardcoded).
Returns the 5 Bay Area camera definitions with embedUrls. See [[Features/Live Cameras]].

```json
{
  "updated_at": "...",
  "sources": ["ABC7 News Bay Area", "Teleport.camera", "California Live Cams", "PTZtv"],
  "cameras": [
    { "id": "sf-downtown-abc7", "title": "...", "embedUrl": "https://youtube.com/embed/...", ... }
  ]
}
```

## `/api/camera-preview?id={camera_id}`

Returns an SVG placeholder for a camera tile when no thumbnail is available. Used as a fallback `data-fallback` attribute on `<img>` elements.

## `/api/news`

**TTL**: 45 seconds.
**Cold-load**: 3-8 seconds (23 RSS feeds + image extraction).

Aggregates 23 RSS feeds with category-balanced selection:

```python
PER_CATEGORY_CAPS = {"ai": 26, "california": 6}
DEFAULT_CAP = 14
```

Returns up to 120 items (caps × ~9 categories), sorted newest-first.

```json
{
  "updated_at": "...",
  "sources": ["BBC World", "Reuters World", ...],
  "errors": [],
  "items": [
    {
      "id": "news-CNN Top Stories-12345",
      "source": "CNN Top Stories",
      "category": "world",
      "title": "...",
      "summary": "...",  // up to 480 chars from content:encoded
      "url": "...",
      "time": "2026-05-26T...",
      "author": "...",
      "thumbnail": "https://..."   // from media:thumbnail / enclosure / inline <img>
    }
  ]
}
```

California feed items go through `CALIFORNIA_BREAKING_RE` keyword filter first.

## `/api/intel`

**TTL**: 90 seconds.

Returns 6 widgets (crypto, FX, HN, Wikipedia, APOD, SpaceX):

```json
{
  "widgets": [
    { "id": "intel-crypto", "kind": "crypto", "items": [...] },
    { "id": "intel-fx", "kind": "fx", "items": [...] },
    { "id": "intel-hn", "kind": "hn", "items": [...] },
    { "id": "intel-wiki", "kind": "wiki", "items": [...] },
    { "id": "intel-apod", "kind": "apod", "items": [...] },
    { "id": "intel-spacex", "kind": "spacex", "items": [...] }
  ]
}
```

Crypto + HN rendered as top bars; rest in the left sidebar Intel Widgets.

## `/api/videos/ai`

**TTL**: 300 seconds (5 min server cache).
**Time window**: 48 hours upstream.
**Filter**: `AI_VIDEO_KEYWORDS` regex on title + description.

Returns YouTube AI videos from 9 channels matching keyword filter:

```json
{
  "items": [
    {
      "id": "yt-ai-video-G8RIAgPxaMc",
      "source": "OpenAI",
      "category": "ai-video",
      "title": "...",
      "summary": "...",
      "url": "https://youtube.com/watch?v=...",
      "video_id": "...",
      "thumbnail": "https://i.ytimg.com/vi/.../hqdefault.jpg",
      "time": "2026-05-26T...",
      "kind": "video"
    }
  ]
}
```

## `/api/videos/gaming`

Same shape as `/api/videos/ai` but:
- 9 POE2-dedicated channels
- 24h window
- `GAMING_VIDEO_KEYWORDS` filter (POE2 only)

## `/api/tts?text=...&lang=en-GB`

**TTL**: 5 minutes (browser-side cache via `Cache-Control: public, max-age=300`).

Proxies Google Translate TTS for the AI Voice agent. Splits long text into ≤190-char chunks at punctuation boundaries, fetches each chunk, concatenates MP3 bytes.

Allowed voices/langs: `en-GB`, `en-US`, `en-AU`, `en-IN`.

Returns `audio/mpeg` (64 kbps, 24 kHz mono).

## Static file serving

Everything else served by `SimpleHTTPRequestHandler` from the project root:
- `/` → `index.html`
- `/styles.css`, `/app.js`
- `/vendor/three.module.min.js`, `/vendor/OrbitControls.js`, `/vendor/satellite.js/*`
- `/countries.geojson`
- `/assets/intro.mp3`

## Related

- [[Architecture/Backend Server]]
- [[APIs/External APIs]]
