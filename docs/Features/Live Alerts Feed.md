---
title: Live Alerts Feed
tags: [feature, alerts, sidebar]
date: 2026-05-26
---

# Live Alerts Feed

Lower portion of the right sidebar (below the camera grid). Compact list of recent events filtered to the active layer toggles.

## Card layout

```
┌─────────────────────────────────────────┐
│ [▣] Severe Thunderstorm Warning  [HIGH] │  ← mini icon + title + severity chip
│                                         │
│ Severe Thunderstorm Warning for Frio,  │  ← 2-line summary
│ TX; Kerr, TX; Medina, TX                │
│                                         │
│ NOAA/NWS Alerts  Severe  2m            │  ← 3 tags: source, metric, time
└─────────────────────────────────────────┘
```

## Rendering

```js
function renderFeed() {
  const events = visibleEvents();
  const sorted = [...events].sort((a, b) => {
    const weight = (e) => {
      const severityScore = { high: 3, medium: 2, low: 1 }[e.severity] ?? 1;
      const layerWeight = e.layer === "aircraft" ? -100 : e.layer === "camera" ? -50 : 0;
      return severityScore + layerWeight;
    };
    return weight(b) - weight(a) || eventTimestamp(b.time) - eventTimestamp(a.time);
  });
  // Render the top 24 cards
  els.alertFeed.innerHTML = sorted.slice(0, 24).map(event => `
    <article class="alert-card ${event.id === state.selectedId ? "active" : ""}"
             data-event-id="${event.id}">
      ...
    </article>
  `).join("");
}
```

## Sort priority

1. Severity rank (high=3, medium=2, low=1)
2. Layer demotion: aircraft → −100, camera → −50 (these are noisy; should not dominate the feed)
3. Recency

So the feed naturally surfaces interesting events: high-severity weather + earthquakes + disasters, with aircraft / cameras pushed to the bottom.

## Click handling

Clicking an alert card → `selectEvent(id, focusCamera=true)`:
- Camera lerps toward the event's lat/lon (fly-to)
- Centered event popup appears with summary + meta
- Right detail panel populates with full event metadata
- Card gets `.active` class for highlighting

## Auto-popup

Notable events (high severity OR specific layers like earthquake/disaster) within the last 5 minutes get auto-popped via `processNewAlerts()` — fires `announceEvent()` which calls `selectEvent()` + plays a per-type alert sound + flashes the marker.

## Layer filter

The alert feed only shows events whose layer is in `state.activeLayers`. Toggling layers off in the left sidebar instantly removes those events from the feed AND removes their markers from the globe.

## Detail panel

When an event is selected, the `#detailPanel` above the alert feed shows:
- Layer chip (type indicator)
- Full title + summary
- Image (for camera events)
- "Open live stream" button (for cameras with `liveUrl`)
- 3-cell grid: Source · Time · Coords
- Detail list: up to 8 key-value pairs (callsign, registration, magnitude, depth, area, etc.)

## Related

- [[Features/3D Globe]]
- [[Layers/Aircraft]]
- [[Layers/Earthquakes]]
