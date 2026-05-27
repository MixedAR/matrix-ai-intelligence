---
title: Session Log — 2026-05-26
tags: [log, history]
date: 2026-05-26
---

# Session Log · 2026-05-26

The full chronological record of building the MATRIX AI Intelligence dashboard from "live video feeds are broken" → "deployed to Railway, live and humming."

## Phase 1 — Camera resurrection

Initial bug report: *"the live video feeds at the bottom are not live."*

Diagnosis: 2 of the YouTube embeds were dead (Times Square stream removed; Tokyo Shibuya turned private), and 3 others only had `liveUrl` placeholders — no `embedUrl`, so they showed thumbnails only.

Fix: searched YouTube's live-only filter, verified `isLive:true + status:OK + oembed-OK` on each candidate. Replaced all 5 with verified working streams (EarthCam Times Square, FNN Tokyo Shibuya, EarthCam Abbey Road, I Love You Venice Rialto, Ozolio Miami).

See [[Bug Fixes/Dead YouTube embeds]].

## Phase 2 — Major redesign

User asked for "Palantir/NSA/CIA AI style interface" with 25+ free APIs, cameras on the right (all 5 simultaneous), breaking news at bottom, smaller cards, fix airplane tracking, callsign labels.

What got built:
- **13 new APIs** added to backend (EMSC, GeoNet, ISS, NHC, EONET Volcanoes, EONET Wildfires, plus RSS feeds: BBC, Reuters, AP, Al Jazeera, NPR, etc.) — see [[APIs/External APIs]]
- **`/api/news` + `/api/intel` endpoints** with category-balanced news selection
- **Bumped aircraft limit** 120 → 600
- **Layout redesigned**: 5 cameras moved to right column with all playing simultaneously; news rail at bottom; smaller compact cards; Palantir aesthetic with corner ticks and JetBrains Mono numerics
- **Refined Three.js icons**: redrew all 18 layer icons with glow halos, gradient fire/sun, polished aircraft silhouette, snowflakes with branchlets, cyclone spiral, volcano with lava
- **Aircraft callsign labels** rendered as separate sprites below each plane (e.g. "UNITED 888")
- **Hover tooltips on globe** — see [[Features/Hover Tooltips]]
- **Live UTC clock** in the globe watermark

## Phase 3 — Breaking news system

User: *"breaking news pop up in top right corner but I want it bottom center above the news row. After 30 secs update the news row with new pop ups. Click open space close the selected window pop up."*

Built:
- **Breaking news popup** moved bottom-center with downward caret → [[Features/Breaking News Popup]]
- **Pending queue system** — new news items withheld from rail until popup dismisses
- **30s countdown bar** with CSS scaleX animation
- **Click-empty-globe-space** to close selected popup (with click-vs-drag detection)
- **Esc** as keyboard shortcut
- **Slow scroll to 30s step interval** for the news rail
- **"JUST IN" badge + magenta flash** for newly-promoted cards

## Phase 4 — Aircraft tracking saga

This took several iterations.

### Iteration A
*"Live aircraft tracking isn't working — no plane icons"* — Found: ADSB.lol points were timing out and the loader crashed entirely. Made it resilient with per-point try/except, shortened OpenSky timeout.

### Iteration B
*"Planes are all in one place at NYC"* — NYC at 250nm returned 800+ aircraft, filling the entire 600-aircraft cap before other regions ran. Added per-region cap, random sampling, smaller radii, 20+ regional points. See [[Bug Fixes/Aircraft clustering at hubs]].

### Iteration C
*"Still clustering at hubs"* — Reduced to 100 planes, more regions (35), smaller cap per region. Parallelized via ThreadPoolExecutor (16 workers).

### Iteration D
*"Need a much better aircraft API"* — Probed airplanes.live, adsb.fi, adsb.one. **airplanes.live wins**: sub-second responses worldwide including Tokyo / Sydney / Sao Paulo / Nairobi where ADSB.lol always timed out. Swapped primary source. See [[Bug Fixes/ADSB.lol replaced]].

Final state: **180 aircraft across 35 regions globally**, ~2 second wall-clock.

## Phase 5 — News refinement

Series of tweaks:

- **Earthquakes M ≥ 2.5 only** — switched USGS feed to `2.5_day.geojson`, added explicit guard in EMSC + GeoNet loaders
- **News cards 2× height + width** — bumped to 560×218px with proper image-left layout
- **Step-scroll 10s → 30s** — readable pace
- **California news filter** — only major breaking (CALIFORNIA_BREAKING_RE) keeps fire/shooting/quake/evacuation/etc keywords
- **+5 AI news feeds** — TechCrunch AI, MIT Tech Review, The Decoder, Marktechpost, HuggingFace, Synced Review, Apple ML (10 total now)
- **YouTube AI + POE2 video cards** — see [[Features/YouTube Video Cards]]
- **Strict POE2 keyword filter** — only Path of Exile 2 videos pass through; 9 dedicated POE2 creators (Palsteron, Moxsy, Fubgun, etc.)
- **2-hour TTL on rail** — cards older than 2h dropped client-side
- **Single merged feed** (PAGE 1/PAGE 2 tabs removed; news + AI + POE2 interleaved by time)

## Phase 6 — Audio system

User wanted distinct sounds per event type + Sound ON default + a "live AI agent" that speaks breaking news headlines.

Built:
- **Web Audio synthesizer** with playTone() + playNoiseBurst() primitives
- **12 distinct sounds** keyed by event type (breaking-news, video, weather, earthquake, disaster, space-weather, aircraft, satellite, camera, natural, air-quality, ocean) — see [[Features/Alert Sounds]]
- **AI Voice agent** with Web Speech API → SpeechSynthesis fallback
- **British female voice picker** preferring Daniel → Kate → Serena → Hazel chain
- **Better voice: Google TTS proxy** (`/api/tts`) — much higher quality than browser SpeechSynthesis. Auto-chunks long headlines at punctuation boundaries.
- **Dual-voice bug fix** — Set-based handle tracker with suppressFallback flag → see [[Bug Fixes/Dual voice playback]]

## Phase 7 — Webview slide-out

User: *"if user clicks a card I want a webview slide out to come out of the left side showing the source page. close button. never leaves app."*

Built [[Features/Webview Slide-out]]:
- Slide-from-left iframe panel (54vw wide)
- Header with source label + title + "Open externally" + close button
- 4-second autoplay-load detection → fallback message for sites blocking iframe
- Esc + close button + click-X to dismiss
- Video cards use `/embed/{video_id}?autoplay=1` so YouTube plays inline

## Phase 8 — Top bars

User: *"crypto and build out a nice bar on top, move it off side. hacker news in a small scrolling ticker at top under crypto info."*

Built [[Features/Crypto + HN Top Bars]]:
- **Crypto strip** — 6 coins evenly spaced with delta colors
- **HN ticker** — continuous CSS marquee, pauses on hover
- Moved both out of the left Intel Widgets panel

## Phase 9 — Flicker hunt

User: *"flicker every 10-15 secs that wasn't here before. cameras reload at same time."*

Diagnosed via MutationObserver — found both `renderCameras()` and `renderNews()` doing full innerHTML rewrites on every poll. The camera iframes were getting destroyed + recreated every refresh, causing video reloads.

Fix: added content-signature dedup to both. After fix: cameraGrid replaced 0 times in 60s; newsTrack replaced only on actual content change. See [[Bug Fixes/Camera iframe reload flicker]].

## Phase 10 — Welcome modal + intro music

User asked for a centered welcome popup with OK button that plays a welcome song.

Built [[Features/Welcome Modal]]:
- Centered modal with brand mark + eyebrow + gradient title + 3 bullets + big OK button
- Clicking OK both dismisses + plays `/assets/intro.mp3`
- The OK click is the user gesture that satisfies browser autoplay policy
- `sessionStorage` flag — shows once per browser session
- Keyboard: Enter / Space / Esc all dismiss
- Autofocus on the OK button

User-supplied MP3 (`0526(1).MP3`, 244 KB) copied into `assets/intro.mp3`.

## Phase 11 — Deployment

Prepared Railway-ready artifacts:
- `nixpacks.toml` (Python 3.12 + curl)
- `railway.json` (health check at /api/cameras)
- `Procfile`
- `requirements.txt` (empty stub)
- `.gitignore`
- Made `matrix_server.py` read `PORT` from env
- Vendored `satellite.js` into `vendor/satellite.js/` so no `npm install` needed

Git workflow:
- `git init` + initial commit (113 files)
- User created GitHub repo `MixedAR/matrix-ai-intelligence`
- HTTPS push failed (no TTY for credentials)
- Set up SSH key (`~/.ssh/id_ed25519`), added to GitHub at github.com/settings/keys
- `git push -u origin main` succeeded
- Persisted SSH command in `git config core.sshCommand` for future pushes

Railway deploy:
- railway.app/new → Deploy from GitHub repo → MixedAR/matrix-ai-intelligence
- Build via Nixpacks ~60s
- Settings → Networking → Generate Domain
- Live at **https://web-production-3c10e.up.railway.app**

Smoke test passed:
- Homepage: HTTP 200, 333ms
- /api/cameras: 105ms
- /api/intel: 8.3s cold, then instant
- /api/news: 100 items, 23 sources, 26 AI items
- /api/events: 463 events, 0 errors, 16s cold load
- /api/tts: valid MP3 (audio/mpeg 24kHz)
- /assets/intro.mp3: 243 KB, audio/mpeg

## Phase 12 — Docs (you are here)

Built this Obsidian vault with cross-linked notes covering architecture, features, layers, APIs, deployment, bug fixes, and reference material. Twenty-something files all linked back to [[00 Master Index]].

## Final stats

- **30 explicit tasks** completed (TaskCreate counter)
- **25+ external APIs** integrated
- **23 RSS feeds** for news (8 world + 10 AI + 5 California + misc)
- **18 YouTube channels** (9 AI + 9 POE2)
- **5 Bay Area live cameras**
- **180 aircraft** tracked across 35 global hubs
- **~100-200 earthquakes** filtered to M ≥ 2.5
- **10 data layers** on the globe
- **12 distinct synthesized alert sounds**
- **2,400 lines** of frontend code
- **1,600 lines** of Python backend
- **0 pip dependencies**, **0 npm runtime dependencies** (all vendored)
- **1 production URL** live on Railway

## Related

- [[00 Master Index]]
- [[Architecture/System Overview]]
- [[Deployment/Railway Setup]]
