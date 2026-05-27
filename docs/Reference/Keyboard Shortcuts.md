---
title: Keyboard Shortcuts
tags: [reference, ux]
date: 2026-05-26
---

# Keyboard Shortcuts

| Key | What it does |
|---|---|
| `Esc` | Close: webview slide-out · breaking-news popup · selected event popup · welcome modal |
| `Enter` / `Space` | (welcome modal open) → dismiss + play intro music |
| (any click) | First click anywhere unlocks Web Audio context for alert sounds |
| Mouse drag on globe | Rotate (overrides auto-rotate temporarily) |
| Scroll on globe | Zoom in / out (`minDistance` 2.75, `maxDistance` 9) |
| Hover marker | Show tooltip |
| Click marker | Select event + fly camera to it + show popup |
| Click empty globe space | Close selected popup |

## Header buttons

| Button | Action |
|---|---|
| **Full Screen** | Browser fullscreen toggle |
| **Pause Rotate / Rotate** | Toggle globe auto-rotation (~70s/rev) |
| **Sound On / Sound Off** | Toggle per-event-type alert sounds (default ON) |
| **AI Voice / Voice On** | Toggle TTS reading of breaking-news headlines (default OFF, persisted) |
| **Refresh** | Force `loadEvents()` immediately |

## Tab modes (top of header)

| Tab | Active layers |
|---|---|
| **Live** | All 10 layers |
| **Timeline** | earthquake + disaster + natural + space-weather + weather + air-quality + ocean (no aircraft/satellite/camera) |
| **Signals** | aircraft + satellite + space-weather + weather + air-quality + ocean (no earthquake/disaster) |
| **Cameras** | camera layer only |

## Layer toggles (left sidebar)

Individual checkboxes for: Seismic · Disasters · Natural Events · Space Weather · Weather Alerts · Live Aircraft · Satellites · Live Cameras · Air Quality · Ocean / Marine.

Click `All` button to enable all layers.

## News rail

- Hover on the rail → step-scroll auto-advance **pauses**
- Move cursor off the rail → resumes advancing one card every 30 seconds
- Click any card → opens [[Features/Webview Slide-out]]

## Crypto + HN bars

- HN ticker pauses on hover (CSS `:hover { animation-play-state: paused }`)
- Click any HN headline → opens external in new tab
- Crypto tiles: hover shows tooltip with full coin name

## Welcome modal (first session only)

- **OK button autofocused** when modal appears
- **Enter** or **Space** dismisses (same as clicking OK)
- **Esc** also dismisses

## Related

- [[Features/3D Globe]]
- [[Features/Webview Slide-out]]
- [[Features/Welcome Modal]]
