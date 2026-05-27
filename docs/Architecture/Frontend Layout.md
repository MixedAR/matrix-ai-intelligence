---
title: Frontend Layout
tags: [architecture, frontend, ui]
date: 2026-05-26
---

# Frontend Layout

CSS Grid driven. `body > main.app-shell` uses `grid-template-rows: auto auto minmax(0, 1fr) auto`.

## Vertical structure

```
Row 1 ─ Header (auto)
       │ Brand + tabs + 4 control buttons
       │ "Live / Timeline / Signals / Cameras"
       │ "Full Screen / Pause Rotate / Sound / AI Voice / Refresh"
       ↓
Row 2 ─ Top bars (auto)
       │ Crypto strip · BTC ETH USDT BNB XRP USDC
       │ HN ticker  · marquee of top stories
       ↓
Row 3 ─ Dashboard (1fr — fills remaining space)
       │ ┌────────┬─────────────────┬────────┐
       │ │  Left  │     Center      │ Right  │
       │ │  panel │     globe       │ panel  │
       │ │ (16vw) │                 │ (22vw) │
       │ └────────┴─────────────────┴────────┘
       ↓
Row 4 ─ Bottom stack (auto)
       │ Breaking newswire (horizontal scroll rail)
       │ Telemetry strip (8 cells)
```

## Left panel — `.panel.layer-panel`

Stacked sections:

1. **Source Layers** — 10 layer toggles with live counts. Click All to enable all layers.
2. **System status** — 3-up grid: Active signals · Live sources · Last update
3. **Intel Widgets** — FX rates, Wikipedia "In the news", NASA APOD, Next SpaceX launch (crypto + HN moved to top bars)

## Center — `.globe-wrap`

- WebGL canvas (Three.js scene, fills the panel)
- Watermark top-left: `MATRIX // ORBITAL VIEW` + live UTC clock
- HUD strip bottom: pulse-dot + `Live feeds online` + sources/signals count
- Floating overlays:
  - `#eventPopup` — appears when a marker is clicked
  - `#mapTooltip` — follows cursor on marker hover
  - (`#breakingPopup` moved out of globe-wrap; lives above newswire now)

## Right panel — `.panel.right-panel`

Two vertically-stacked sections:

1. **Live Camera Grid** — 5 tiles
   - Featured tile (16:9) for the first camera
   - 2×2 grid below for the other 4
   - All YouTube iframes autoplaying, muted
   - See [[Features/Live Cameras]]
2. **Live Alerts** — sorted alert cards, filterable by layer toggles

## Bottom — `.bottom-stack`

1. **`.breaking-popup`** — slides up from the news rail when new breaking news arrives. Caret pointing down, magenta border. See [[Features/Breaking News Popup]].
2. **`.news-rail`** — horizontally-scrolling 560px-wide cards. 218px tall. News + AI videos + POE2 videos merged + sorted by time. Step-scrolls one card every 30s. See [[Features/Breaking Newswire]].
3. **`.bottom-command`** — 8-cell telemetry footer: Mode · Aircraft · Satellites · Cameras · Weather · Seismic · News · Selected

## Welcome modal — `#welcomeBackdrop`

Fixed overlay, centered. Shown once per session (sessionStorage flag). See [[Features/Welcome Modal]].

## Webview slide-out — `#webView`

Hidden left-side panel that slides in (`width: min(54vw, 920px)`) when a news/video card is clicked. Contains:
- Header: source + title + "Open externally" + close button
- iframe with sandbox attributes
- Fallback message for sites blocking iframe embed

See [[Features/Webview Slide-out]].

## Responsive breakpoints

| Width | Behavior |
|---|---|
| ≤ 1280px | Tighter column widths |
| ≤ 1024px | Dashboard collapses to single column; bottom command collapses to 2 cols |
| ≤ 640px | Mobile mode: stacked everything, tabs grid 4-wide |

## Color system

Defined as CSS custom properties on `:root`. See [[Reference/Color Palette]].

Key accents:
- `--cyber` (#43e8d8) — primary accent, system OK, live status
- `--accent-2` (#ff4fa3) — alerts, breaking news, danger
- `--accent` (#48a6ff) — secondary accent
- `--gold` (#f8c35b) — California / business news
- `--good`, `--warning`, `--danger`, `--hot` — severity scale

## Typography

- **Inter** (300-800) — UI text, headlines, descriptions
- **JetBrains Mono** (400-700) — all numerics, telemetry, monospace tags, timestamps

## Related

- [[Features/3D Globe]]
- [[Features/Live Cameras]]
- [[Features/Breaking Newswire]]
- [[Features/Crypto + HN Top Bars]]
