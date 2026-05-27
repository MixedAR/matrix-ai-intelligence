---
title: System Overview
tags: [architecture, overview]
date: 2026-05-26
---

# System Overview

## Stack
- **Frontend**: Vanilla JS modules + Three.js (WebGL globe) + Web Audio + SpeechSynthesis. No bundler, no framework — direct ES modules served by the same Python server.
- **Backend**: Python 3.12 standard library only. `BaseHTTPRequestHandler` + `ThreadingHTTPServer`. Zero pip dependencies. Out-of-band parallelism via `concurrent.futures.ThreadPoolExecutor`.
- **Deployment**: Railway (Nixpacks builder). See [[Deployment/Railway Setup]].

## Process

```
┌─ Browser ───────────────────────────┐    ┌─ Python server (matrix_server.py) ─┐
│                                     │    │                                    │
│  index.html ←——————————————————————─┤    │  GET /api/events     (cold ~16s)   │
│  app.js (ES modules)               │    │  GET /api/cameras                  │
│  styles.css                        │←───│  GET /api/satellites               │
│  Three.js globe                    │    │  GET /api/news       (45s cache)   │
│  Speech / Audio                    │    │  GET /api/intel                    │
│  Web Audio synth (per-type alerts) │    │  GET /api/videos/ai                │
│                                     │    │  GET /api/videos/gaming            │
└─────────────────────────────────────┘    │  GET /api/tts        (Google TTS)  │
                                            │  GET /api/camera-preview (SVG)     │
                                            └────────────────────────────────────┘
                                                       │
                                                       ↓
                                       Parallel fan-out to 25+ external APIs
                                       (USGS, EMSC, GeoNet, GDACS, EONET, NHC,
                                        NWS, Open-Meteo, NOAA SWPC, NOAA CO-OPS,
                                        airplanes.live, ISS, CelesTrak, CoinGecko,
                                        ExchangeRate, Wikipedia, NASA APOD, SpaceX,
                                        Hacker News, RSS feeds × 18, YouTube
                                        channel RSS × 18)
```

## Key design decisions

| Decision | Why |
|---|---|
| Long-running server, not serverless | Cold loads take 16–30s with parallel fan-out; serverless 10s timeouts kill us. Railway perfect fit. |
| In-memory caches with per-endpoint TTL | First call slow, subsequent calls instant. TTLs: events 55s, news 45s, intel 90s, videos 300s. |
| `ThreadPoolExecutor` (8–16 workers) | RSS / ADSB region calls parallelized 10×+ — turns 100s sequential into 5s parallel. |
| `safeFetch` wrapper in client | Each endpoint has its own timeout so one slow API can't block the whole dashboard. See [[Bug Fixes/Satellite API hanging]]. |
| `subprocess.run(["curl", ...])` for some HTTP | Some APIs (StreamElements TTS, Google Translate TTS) return 401 to urllib but 200 to curl. Curl shell-out is the workaround. Curl is in Railway's Nixpacks setup. |
| Idempotent renders via content signature | Camera iframes used to reload every 60s on `renderCameras()`. Now signature-checked. See [[Bug Fixes/Camera iframe reload flicker]]. |
| Vendored satellite.js | No npm install needed on Railway. JS deps shipped in `vendor/satellite.js/`. |

## Three-row layout

```
┌──────────── Header ────────────────────────────────┐
│ Brand | Tabs (Live/Timeline/Signals/Cameras) | Btns│
├────────────────────────────────────────────────────┤
│ Crypto top bar  · BTC/ETH/USDT/BNB/XRP/USDC       │
├────────────────────────────────────────────────────┤
│ HN ticker · marquee of top stories                │
├──────────┬─────────────────────────┬──────────────┤
│  Source  │                         │  Live Cams   │
│  Layers  │      3D Globe           │  (5 tiles)   │
│  +Intel  │      + markers          │              │
│  Widgets │      + popup            ├──────────────┤
│          │      + tooltips         │  Live Alerts │
│          │      + HUD              │              │
├──────────┴─────────────────────────┴──────────────┤
│ Breaking Newswire (horizontal step-scroll rail)   │
├────────────────────────────────────────────────────┤
│ Bottom telemetry (8 cells)                        │
└────────────────────────────────────────────────────┘
```

See [[Architecture/Frontend Layout]] for component-level detail.

## Files

The whole project is ~30 source files. See [[Architecture/File Structure]] for what each one does.

## Related

- [[Architecture/Backend Server]]
- [[Architecture/Data Flow]]
- [[APIs/External APIs]]
