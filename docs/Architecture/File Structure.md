---
title: File Structure
tags: [architecture, reference]
date: 2026-05-26
---

# File Structure

```
matrix-ai-intelligence/
│
├── matrix_server.py        Python HTTP server + all /api endpoints
├── index.html              Static frontend shell
├── app.js                  All client logic (ES module, no bundler)
├── styles.css              All styling (Palantir-style theme)
├── countries.geojson       14 MB country borders, drawn onto globe texture
│
├── vendor/
│   ├── OrbitControls.js    Three.js orbit controls
│   ├── three.module.min.js Three.js (WebGL renderer)
│   └── satellite.js/       Vendored TLE-propagation library
│
├── assets/
│   └── intro.mp3           Welcome song played on first load
│
├── Procfile                Railway start command
├── railway.json            Railway build + health-check config
├── nixpacks.toml           Nixpacks builder spec (Python 3.12 + curl)
├── requirements.txt        Empty stub (signals Python project to nixpacks)
├── .gitignore              Excludes node_modules, __pycache__, .DS_Store
├── package.json            Legacy — npm pin for satellite.js (not needed on Railway)
│
└── docs/                   This Obsidian vault
    ├── 00 Master Index.md
    ├── Architecture/
    ├── Features/
    ├── Layers/
    ├── APIs/
    ├── Deployment/
    ├── Bug Fixes/
    └── Reference/
```

## Per-file responsibility

### `matrix_server.py` (~1,600 lines)
- `ThreadingHTTPServer` listening on `os.environ["PORT"]` or 8000
- 9 API endpoints (see [[APIs/Internal Endpoints]])
- 20+ data-source loaders (`load_usgs`, `load_emsc`, `load_aircraft`, `_load_airplanes_live`, `load_iss_position`, `load_nhc_storms`, `load_volcano_eonet`, `load_wildfire_eonet`, `load_cameras`, `load_space_weather`, `load_weather_alerts`, `load_live_weather`, `load_air_quality`, `load_ocean_levels`, `load_marine_weather`, `load_geonet_quakes`, `load_news_rss`, etc.)
- 5 module-level caches with per-endpoint TTL (`cache`, `satellite_cache`, `news_cache`, `intel_cache`, `videos_ai_cache`, `videos_gaming_cache`)
- RSS parser (`parse_rss`) with image extraction
- TTS proxy (`/api/tts`) → Google Translate via `subprocess.curl`

### `index.html` (~150 lines)
- App shell skeleton
- Welcome modal (centered, dismissible)
- Header with brand + tabs + 4 control buttons
- Top bars (crypto + HN ticker)
- 3-column dashboard
- Bottom newswire rail + 8-cell telemetry footer
- Webview slide-out overlay
- Hidden hover tooltip + breaking news popup + event popup

### `app.js` (~2,400 lines)
- Three.js scene setup + globe + atmosphere + starfield
- 10-layer marker system with custom Canvas icons
- Aircraft callsign labels as separate sprites
- 25+ external API integrations via `loadEvents`, `pollNews`, `pollYouTubeVideos`
- News rail with 2h TTL filter + content-signature dedup
- Breaking-news queue (pending → popup → promoted to rail)
- AI voice agent (TTS proxy + SpeechSynthesis fallback) — see [[Features/AI Voice Agent]]
- Per-event-type Web Audio alert synthesizer — see [[Features/Alert Sounds]]
- Webview slide-out controller — see [[Features/Webview Slide-out]]
- Welcome modal flow — see [[Features/Welcome Modal]]
- Auto-scroll ticker (30s step) — see [[Features/Breaking Newswire]]
- Crypto bar + HN marquee renderers

### `styles.css` (~1,500 lines)
- Palantir-grade theme: 13px base, JetBrains Mono for numerics
- CSS custom-properties color system — see [[Reference/Color Palette]]
- Corner-tick decorations on every panel
- Animations: pulse, shimmer, marquee, slide-in, fade
- Responsive breakpoints: 1280px, 1024px, 640px

### `countries.geojson` (14 MB)
- Country polygon data for the globe texture
- Loaded asynchronously, redraws Earth canvas texture once ready

### `vendor/satellite.js/`
- Vendored copy of `node_modules/satellite.js/dist/`
- Used for ECI → geodetic TLE propagation on the client
- Vendored so Railway doesn't need `npm install` during deploy

### `assets/intro.mp3`
- Welcome song (244 KB, 128 kbps stereo MP3)
- Plays on first session after OK click on the welcome modal
- See [[Features/Welcome Modal]]

## Deploy artifacts

| File | Purpose |
|---|---|
| `Procfile` | `web: python3 matrix_server.py` — Heroku-compatible start spec |
| `railway.json` | Health check at `/api/cameras`, restart on failure |
| `nixpacks.toml` | Install Python 3.12 + curl |
| `requirements.txt` | Empty stub — nudges nixpacks to Python builder |

## Related

- [[Architecture/System Overview]]
- [[Architecture/Backend Server]]
- [[Deployment/Railway Setup]]
