---
title: 3D Globe
tags: [feature, globe, threejs, frontend]
date: 2026-05-26
---

# 3D Globe

Three.js WebGL scene that renders a rotating Earth with up to ~1,000 markers across 10 data layers.

## Mesh structure

```
scene
├── ambient light + key light + rim light (cyan)
├── globeGroup
│   ├── Earth mesh (sphere R=2, 96×96 segments)
│   │   ├── canvas texture (4096×2048) drawn from countries.geojson
│   │   ├── ocean gradient + lat/long grid lines
│   │   └── star field overlay
│   └── atmosphere shell (R=2.05, cyan back-side)
├── markerGroup
│   ├── ~1,000 sprite markers (one per event)
│   └── aircraft callsign label sprites (extra layer)
└── 1,400 stars (rendered as THREE.Points)
```

The `markerGroup.rotation.y` is synced to `globeGroup.rotation.y` each frame so markers rotate WITH the Earth when auto-rotate is on.

## Marker creation

```js
function createMarker(event) {
  const group = new THREE.Group();
  const radius =
    event.layer === "satellite" ? 2.55 :
    event.layer === "aircraft"  ? 2.22 :
                                  2.08;
  group.position.copy(latLngToVector3(event.lat, event.lon, radius));
  group.lookAt(0, 0, 0);

  const icon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: iconTexture(eventIconKey(event), event.layer),
    transparent: true, depthTest: false, depthWrite: false,
  }));
  icon.scale.setScalar(0.072);          // base size
  icon.userData.eventId = event.id;
  group.add(icon);

  // Aircraft also get a callsign label sprite directly below
  if (event.layer === "aircraft") {
    const callsign = (event.details?.Callsign || event.title).slice(0, 12).toUpperCase();
    const label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: callsignLabelTexture(callsign), ...
    }));
    label.scale.set(0.11, 0.028, 1);
    label.position.set(0, -0.05, 0);
    group.add(label);
  }

  markerGroup.add(group);
  state.markers.set(event.id, group);
  state.markerObjects.push(icon);   // for raycast
}
```

## 10 layer types & their icons

Each `eventIconKey(event)` resolves to one of these canvas-drawn icons:

| Layer | Icon | Color |
|---|---|---|
| earthquake | concentric pulse rings + center dot | red #ff3d4f |
| disaster (cyclone) | spiral arms | orange |
| disaster (flood) | triangular wave | orange |
| disaster (drought) | sun + cracks | gold |
| disaster (general) | warning triangle | orange |
| natural (fire) | gradient flame | red-orange |
| natural (volcano) | mountain + lava plume | red |
| natural (ice) | snowflake with branchlets | cyan |
| weather (rain) | cloud + rain streaks | blue |
| weather (snow) | cloud + 6-arm snowflakes | blue |
| weather (storm) | cloud + lightning bolt | blue |
| weather (wind / air-quality) | curved wind lines | blue/pink |
| space-weather | sun corona | gold |
| aircraft | sleek plane silhouette (top-down) | white |
| satellite | body + solar panels + orbit ring | orange |
| camera | camera body + lens cone + REC dot | cyan |
| ocean | water waves | blue |
| natural-general / disaster-general | warning triangle with `!` | orange |

Icons are drawn at 128×128 onto an `HTMLCanvasElement` and converted to `THREE.CanvasTexture`. Cached in `iconTextures` Map by key so each unique icon is drawn exactly once.

## Aircraft callsign labels

Each aircraft sprite gets a 256×64 canvas label below it ("UNITED 888", "LXJ305", etc). Cached in `labelTextures` Map by text so duplicate callsigns share the same texture.

## Hover tooltip

`pointermove` → throttled to `requestAnimationFrame` → `raycaster.intersectObjects(state.markerObjects)`. On hit, [[Features/Hover Tooltips]] shows a small dark card following the cursor with SRC/SIG/SEV/POS/TIME.

## Click handling

Click-vs-drag detection on `pointerdown` + `pointerup`:
- Δx > 5 or Δy > 5 or Δt > 600ms → treated as drag (rotate globe)
- Otherwise it's a click → raycast → either `selectEvent(id)` (show popup + detail) or `closeSelectedPopup()` (if empty space)

## Auto-rotate

`state.autoRotate` toggleable via header button. Rotates `globeGroup.rotation.y` by 0.0009 rad/frame (~one full rotation every 70 seconds).

## Pulse animation

Every frame, each marker's `baseScale` is multiplied by `1 + sin(time * 0.008) * 0.04` for a subtle breathing effect. High-severity markers use `baseScale: 1.15` (12% larger). Flashing markers (just-announced popups) use 0.24 instead of 0.04 amplitude.

## Selection focus

When a marker is selected via card click (`selectEvent(id, focusCamera=true)`), the camera lerps 55% toward the marker's lat/lon at radius 5.2 — gives a "fly-to" feel without disorienting the user.

## Related

- [[Features/Hover Tooltips]]
- [[Layers/Aircraft]]
- [[Layers/Earthquakes]]
- [[Bug Fixes/Aircraft clustering at hubs]]
