---
title: Bug — Camera iframe reload flicker
tags: [bug, frontend, performance]
date: 2026-05-26
---

# Bug · Camera iframe reload flicker

**Symptom**: every 10-15 seconds, the dashboard flickered visibly and the 5 YouTube live cameras reloaded from scratch.

## Root cause

Two functions were doing full `innerHTML = ...` rewrites on a fast cadence even when nothing about the data had changed:

| Function | Cadence | What it did |
|---|---|---|
| `renderCameras()` | Every 60s on `loadEvents()` refresh | Replaced cameraGrid's 5 YouTube iframes with brand-new iframe elements pointing at the same URLs. Browser sees them as fresh and reloads the video from scratch. |
| `renderNews()` | Every 25s on `pollNews()` + on every video-poll callback | Full rewrite of all 14-50 cards even when item IDs hadn't changed. |

Verified via `MutationObserver`:

```
[23:49:41.541] cameraGrid REPLACED (children removed=11, added=11)
[23:49:31.708] newsTrack REPLACED (removed=29, added=29)
[23:49:41.541] newsTrack REPLACED (removed=29, added=29)
```

## Fix

Both functions now compute a content signature BEFORE touching the DOM and skip the rewrite when nothing has changed.

### `renderCameras()`

```js
let renderedCameraSignature = "";

function renderCameras() {
  const liveCameras = state.cameras.filter(c => c.embedUrl).slice(0, 5);
  els.cameraCount.textContent = `${liveCameras.length} live`;
  ...
  const signature = liveCameras.map(c => `${c.id}:${c.embedUrl}`).join("|");
  if (signature === renderedCameraSignature) return;   // ← no-op
  renderedCameraSignature = signature;
  els.cameraGrid.innerHTML = ...
}
```

Because the 5 Bay Area camera IDs + embed URLs never change once the server boots, after the first render `renderCameras()` becomes a no-op forever. Iframes stay alive, videos play continuously.

### `renderNews()`

```js
let renderedNewsSignature = "";

function renderNews() {
  ...
  const slice = merged.slice(0, 50);
  const minuteBucket = Math.floor(Date.now() / 60000);  // relative-time text refreshes once/min
  const freshTag = `${state.freshNewsIds.size}:${state.freshVideoIds.size}`;
  const sig = `${minuteBucket}|${freshTag}|` + slice.map(i => i.id).join(",");
  if (sig === renderedNewsSignature) return;
  renderedNewsSignature = sig;
  els.newsTrack.innerHTML = ...
}
```

The signature includes:
- **Item IDs** — identical poll results don't trigger a rebuild
- **Minute-bucketed timestamp** — `"3m ago" → "4m ago"` still updates once per minute as content goes stale
- **Fresh-set sizes** — "JUST IN" flash animation still kicks in when a new card arrives

## Verification

60-second MutationObserver run after the fix:
- `cameraGrid` replaced: **0 times** (was: every 60s)
- `newsTrack` replaced: **1 time** (was: every 10-15s, often more) — happened when an actual new headline arrived

## Lesson

For DOM with heavy embedded content (iframes, video, large image grids), **always** dedupe rerenders by content signature. The browser doesn't intelligently diff `innerHTML` assignments — every reassignment destroys + recreates child elements, which destroys their state (iframe video position, scroll state, focus, etc).

## Related

- [[Features/Live Cameras]]
- [[Features/Breaking Newswire]]
