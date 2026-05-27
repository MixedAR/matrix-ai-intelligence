---
title: Data Flow
tags: [architecture, dataflow]
date: 2026-05-26
---

# Data Flow

## On first page load

```
Browser opens https://web-production-3c10e.up.railway.app/
   ↓
GET /  →  matrix_server returns index.html
   ↓
Browser fetches /styles.css, /app.js (module), /vendor/three.module.min.js,
                 /vendor/satellite.js/io.js, /countries.geojson
   ↓
app.js boots:
  • Creates Three.js scene, globe, atmosphere, starfield
  • bindControls()
  • resize() + animate() rAF loop
  • loadCountryTexture() — async fetches geojson, redraws Earth canvas texture
  • showWelcomeModal()  ← centered modal blocks until user clicks OK
  • setInterval pollers wired up
  • tickClock starts
```

## After user clicks OK on welcome modal

```
OK click handler:
  1. playIntroTrack()           — plays /assets/intro.mp3 (user gesture unlocks audio)
  2. sessionStorage flag set    — modal won't show again this session
  3. modal slides out
  4. attachAudioUnlock()        — first pointerdown resumes Web Audio context
```

## Initial data load (first call)

```
loadEvents() fires 5 parallel safeFetch calls:
  • /api/events     (45s timeout)
  • /api/satellites (12s)
  • /api/cameras    (8s)
  • /api/news       (12s)
  • /api/intel      (12s)

Each safeFetch races fetch() against setTimeout(null) — so a hanging
endpoint can't block the UI from rendering.
```

Server side, `build_payload()` (events) fans out:

```
Parallel via try/except + ThreadPoolExecutor:
  load_usgs            → earthquake.usgs.gov  
  load_emsc_seismic    → seismicportal.eu
  load_geonet_quakes   → api.geonet.org.nz
  load_gdacs           → gdacs.org
  load_eonet           → eonet.gsfc.nasa.gov
  load_volcano_eonet   → eonet.gsfc.nasa.gov?category=volcanoes
  load_wildfire_eonet  → eonet.gsfc.nasa.gov?category=wildfires
  load_nhc_storms      → nhc.noaa.gov/CurrentStorms.json
  load_space_weather   → services.swpc.noaa.gov
  load_weather_alerts  → api.weather.gov
  load_live_weather    → api.open-meteo.com (12 cities single call)
  load_air_quality     → air-quality-api.open-meteo.com (12 cities)
  load_ocean_levels    → api.tidesandcurrents.noaa.gov (5 stations)
  load_marine_weather  → marine-api.open-meteo.com (6 zones)
  load_aircraft        → api.airplanes.live (35 regional points, 16-thread pool)
  load_iss_position    → api.wheretheiss.at
  load_cameras         → static list (5 Bay Area)
```

All events flow into a single `events[]` array, sorted by time desc.

## After data arrives in browser

```
state.baseEvents = payload.events
state.satelliteTles = satellites.satellites
state.cameras = cameras.cameras
state.news = news.items
state.intel = intel.widgets

→ renderCameras()  (idempotent via signature, see Bug Fixes)
→ renderNews()     (idempotent via signature)
→ renderIntel()    (also renders crypto + HN top bars)
→ renderAll()      (renderLayers + syncMarkers + renderFeed)
→ renderTelemetry()
→ processNewAlerts()  — picks the most-severe new event, auto-pops it
```

## Recurring polls

| Interval | What runs |
|---|---|
| **1 second** | `tickClock()` — updates UTC clock in globe watermark |
| **15 seconds** | Recompute satellite positions client-side from TLE → render |
| **25 seconds** | `pollNews()` — fetch /api/news + /api/intel, detect new news, queue breaking popups |
| **30 seconds** | News rail auto-scrolls one card width (smooth) |
| **60 seconds** | `loadEvents()` full refresh of all 5 endpoints |
| **15 minutes** | `pollYouTubeVideos()` — refresh AI + POE2 video feeds |
| **mouse-move** | `pointermove` raycaster updates hover tooltip |

## Breaking-news flow (popup → rail)

```
new news item arrives via pollNews()
  ↓
detectBreakingNews(items)
  ↓
state.pendingNews.push(newItem)       ← held back from rail
state.news = rawNews − pendingNews    ← rail shows everything else
  ↓
showNextBreakingPopup()
  • peek head of pendingNews
  • render popup centered above news rail
  • play "breaking-news" alert sound
  • speakHeadline(item.title) via TTS proxy (if voice enabled)
  • setTimeout(30s) to auto-dismiss
  ↓
30s timer or × clicked → dismissBreakingPopup(promote=true)
  ↓
state.pendingNews.shift()             ← remove from queue
state.freshNewsIds.add(item.id)       ← mark for "JUST IN" badge
state.news = rawNews − pendingNews    ← now item appears in rail
renderNews()                          ← rail re-renders with new card at position 1
  ↓
setTimeout(5.5s) → fresh flag cleared, rail re-renders normally
  ↓
showNextBreakingPopup()               ← chain to next pending if any
```

## Click on news card → webview

```
user clicks news/video card
  ↓
data-news-card="true" listener fires
  ↓
openWebView({ url, source, title })
  ↓
#webView iframe.src = url   (for news)
or                = embedUrl (for video — YouTube /embed/ URL plays inline)
  ↓
.webview slides in from left, opacity 0 → 1, translateX(-100%) → 0
  ↓
4-second autoplay-load detection:
  • if iframe loaded → continue
  • if not (X-Frame-Options blocked) → show fallback panel with
    "Open externally ↗" prompt
```

See [[Features/Webview Slide-out]] for details.

## Related

- [[Architecture/Backend Server]]
- [[Features/Breaking News Popup]]
- [[Features/AI Voice Agent]]
