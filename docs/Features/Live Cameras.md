---
title: Live Cameras (Bay Area)
tags: [feature, cameras, youtube, bay-area]
date: 2026-05-26
---

# Live Cameras — Bay Area

Right-column tile grid showing 5 live YouTube streams simultaneously, all autoplay/muted.

## The 5 feeds

| # | Camera | Source channel | Coords |
|---|---|---|---|
| 1 | San Francisco Downtown Live | ABC7 News Bay Area | 37.77, -122.42 |
| 2 | SF–Oakland Bay Bridge Live | ABC7 News Bay Area | 37.80, -122.38 |
| 3 | Golden Gate / SF Skyline Live | Teleport.camera | 37.83, -122.37 |
| 4 | Pier 39 / Fisherman's Wharf Live | California Live Cams | 37.81, -122.41 |
| 5 | US-101 / Santa Clara Valley Live | PTZtv | 37.13, -121.65 |

All verified live + embeddable via YouTube's oembed endpoint before being added.

## Hardcoded in `matrix_server.py`

```python
CAMERAS = [
    {
        "id": "sf-downtown-abc7",
        "title": "San Francisco Downtown Live",
        "source": "ABC7 News Bay Area",
        "lat": 37.7749, "lon": -122.4194,
        "liveUrl": "https://www.youtube.com/watch?v=G8RIAgPxaMc",
        "embedUrl": "https://www.youtube.com/embed/G8RIAgPxaMc?autoplay=1&mute=1&playsinline=1&controls=0&rel=0",
        "thumbnailUrl": "https://i.ytimg.com/vi/G8RIAgPxaMc/hqdefault_live.jpg",
        ...
    },
    # ... 4 more
]
```

## Layout

`.camera-grid-side` is a 2-column CSS grid:
- Tile #1 spans both columns at the top (16:9 featured)
- Tiles #2-5 fill a 2×2 grid below at 16:10 each

Each tile is an `<iframe>` directly pointing to `youtube.com/embed/{VIDEO_ID}?autoplay=1&mute=1&playsinline=1&controls=0&rel=0`. YouTube renders the video inline, no JS needed.

## Overlays on each tile

```html
<div class="tile-overlay">
  <div class="tile-overlay-top">
    <span class="cam-num">01</span>      <!-- numbered cyan badge -->
    <span class="live-pill">LIVE</span>  <!-- pulsing red dot + LIVE -->
  </div>
  <div class="tile-overlay-bottom">
    <strong>San Francisco Downtown Live</strong>
    <small>ABC7 News Bay Area</small>
  </div>
</div>
```

The overlays use `pointer-events: none` so YouTube's own controls still work underneath.

## Idempotent rendering

`renderCameras()` computes a signature from camera IDs + embed URLs. If unchanged (which is always for these static feeds after first render), it skips the DOM rewrite entirely — keeps iframes alive and videos playing continuously.

See [[Bug Fixes/Camera iframe reload flicker]] for why this matters.

```js
let renderedCameraSignature = "";

function renderCameras() {
  ...
  const signature = liveCameras.map(c => `${c.id}:${c.embedUrl}`).join("|");
  if (signature === renderedCameraSignature) return;  // no-op
  renderedCameraSignature = signature;
  els.cameraGrid.innerHTML = ...
}
```

## Click handling

Clicking a camera tile (outside the iframe area) calls `selectEvent("camera-{id}", true)` which:
- Camera-fly-to: lerps the globe camera 55% toward the camera's lat/lon
- Highlights the alert card if visible
- Shows the detail panel on the right

## How I found these

Searched YouTube with the `&sp=EgJAAQ%253D%253D` live-only filter:

```
youtube.com/results?search_query=san+francisco+live+webcam&sp=EgJAAQ%253D%253D
```

Then probed each candidate's playability:
```bash
curl -sL "https://www.youtube.com/watch?v={ID}" | grep -E "isLive|playabilityStatus"
```

And confirmed embeddability via:
```bash
curl https://www.youtube.com/oembed?url=https://...&format=json
```

The previous globally-scattered camera set (Times Square / Tokyo Shibuya / Abbey Road / Venice / Miami) was replaced with these Bay Area feeds in one swap. See the original lineup in [[Bug Fixes/Dead YouTube embeds]].

## Related

- [[Bug Fixes/Camera iframe reload flicker]]
- [[Bug Fixes/Dead YouTube embeds]]
- [[Layers/Cameras]]
