---
title: Hover Tooltips
tags: [feature, globe, ux]
date: 2026-05-26
---

# Hover Tooltips

When the user hovers over any marker on the 3D globe, a compact intel card follows the cursor showing the event's key metadata.

## Visual

```
┌───────────────────────────────────┐
│ ● aircraft                        │   ← layer name + colored dot
│                                   │
│ UNITED 1234 aircraft track        │   ← title
│                                   │
│  SRC   OpenSky Network           │
│  SIG   11500 m                   │   ← key metric (altitude, magnitude, etc)
│  SEV   LOW                       │
│  POS   40.71, -74.01             │
│  TIME  2m ago                    │
└───────────────────────────────────┘
```

Follows the cursor offset by `(12, 12)` px, auto-flips to the other side if it'd run off the right/bottom edge.

## How

```js
let hoverRaf = 0;
let lastHoverX = 0;
let lastHoverY = 0;

renderer.domElement.addEventListener("pointermove", (event) => {
  lastHoverX = event.clientX;
  lastHoverY = event.clientY;
  if (hoverRaf) return;  // throttle to rAF
  hoverRaf = requestAnimationFrame(() => {
    hoverRaf = 0;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((lastHoverX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((lastHoverY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(state.markerObjects, false);
    if (hits.length) {
      const eventId = hits[0].object.userData.eventId;
      const hovered = state.events.find(ev => ev.id === eventId);
      if (hovered) {
        showMapTooltip(hovered, lastHoverX, lastHoverY);
        renderer.domElement.style.cursor = "pointer";
        return;
      }
    }
    hideMapTooltip();
    renderer.domElement.style.cursor = "grab";
  });
});

renderer.domElement.addEventListener("pointerleave", hideMapTooltip);
```

`pointermove` is throttled to `requestAnimationFrame` so the raycast runs at most once per frame regardless of how fast the mouse moves.

## Rendering

```js
function showMapTooltip(event, clientX, clientY) {
  if (state.hoveredEventId === event.id) {
    positionMapTooltip(clientX, clientY);
    return;  // same marker, just reposition
  }
  state.hoveredEventId = event.id;
  els.mapTooltip.innerHTML = `
    <div class="map-tooltip-head">
      <span class="dot" style="background: ${color}; box-shadow: 0 0 6px ${color};"></span>
      <span>${event.layer.replace("-", " ")}</span>
    </div>
    <h4>${event.title}</h4>
    <div class="map-tooltip-meta">
      <strong>SRC</strong><span>${event.source}</span>
      <strong>SIG</strong><span>${eventMetric(event)}</span>
      <strong>SEV</strong><span>${(event.severity || "low").toUpperCase()}</span>
      <strong>POS</strong><span>${event.lat.toFixed(2)}, ${event.lon.toFixed(2)}</span>
      <strong>TIME</strong><span>${relativeTime(event.time)} ago</span>
    </div>
  `;
  els.mapTooltip.classList.remove("hidden");
  positionMapTooltip(clientX, clientY);
}
```

## Edge-detection

```js
function positionMapTooltip(clientX, clientY) {
  const w = els.mapTooltip.offsetWidth;
  const h = els.mapTooltip.offsetHeight;
  let x = clientX + 14;
  let y = clientY + 14;
  if (x + w > window.innerWidth - 8) x = clientX - w - 14;   // flip left
  if (y + h > window.innerHeight - 8) y = clientY - h - 14;  // flip up
  els.mapTooltip.style.left = `${Math.max(8, x)}px`;
  els.mapTooltip.style.top = `${Math.max(8, y)}px`;
}
```

Tooltip is `position: fixed` and `pointer-events: none` so it never interferes with the actual marker click.

## Layer-color dot

The dot in the tooltip head matches the layer's color from the `layers[]` definition:
- aircraft → white #f6f8ff
- earthquake → red #ff3d4f
- camera → cyan #43e8d8
- satellite → orange #ff7a1a
- etc.

Cursor changes to `pointer` over a marker, back to `grab` over empty globe space, so the cursor itself signals hoverability.

## Related

- [[Features/3D Globe]]
