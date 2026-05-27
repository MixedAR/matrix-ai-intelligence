---
title: Bug — Camera grid not rendering on initial load
tags: [bug, frontend, network]
date: 2026-05-26
---

# Bug · Camera grid not rendering on initial load

**Symptom**: after a recent change, the camera grid (right column) was empty. `cameraCount` text stuck at `0 online`. But individual camera URLs worked when fetched directly.

## Diagnosis

`renderCameras()` is only called from `loadEvents()`. So if cameras weren't rendering, `loadEvents()` itself must be hanging.

Endpoint timing test:
```
=== /api/satellites ===
HTTP 000 took 25.673664s         ← hung
=== /api/cameras ===
HTTP 200 took 0.000982s          ← fine
=== /api/news ===
HTTP 200 took 0.001351s          ← fine
=== /api/intel ===
HTTP 200 took 0.000942s          ← fine
```

`/api/satellites` was hanging at 25+ seconds because the TLE upstream (`tle.ivanstanojevic.me`) was slow / unreachable.

In `loadEvents()`, the satellite fetch was the ONLY one without `.catch()` or a timeout:

```js
const [response, satelliteResponse, cameraResponse, newsResponse, intelResponse] = await Promise.all([
  fetch(`/api/events?ts=${Date.now()}`),
  fetch(`/api/satellites?ts=${Date.now()}`),           // ← no .catch, no timeout
  fetch(`/api/cameras?ts=${Date.now()}`),
  fetch(`/api/news?ts=${Date.now()}`).catch(() => null),
  fetch(`/api/intel?ts=${Date.now()}`).catch(() => null),
]);
```

`Promise.all` waits indefinitely for `satelliteResponse`. Meanwhile `renderCameras()` is on line 30 of `loadEvents` — never reached.

## Fix

Wrapped every endpoint call in a `safeFetch(url, timeoutMs)` helper:

```js
const safeFetch = (url, ms) => Promise.race([
  fetch(url).catch(() => null),
  new Promise((resolve) => setTimeout(() => resolve(null), ms)),
]);

const [response, satelliteResponse, cameraResponse, newsResponse, intelResponse] = await Promise.all([
  safeFetch(`/api/events?ts=${Date.now()}`, 45000),
  safeFetch(`/api/satellites?ts=${Date.now()}`, 12000),
  safeFetch(`/api/cameras?ts=${Date.now()}`, 8000),
  safeFetch(`/api/news?ts=${Date.now()}`, 12000),
  safeFetch(`/api/intel?ts=${Date.now()}`, 12000),
]);
```

Each endpoint has its own deadline. If any single one stalls, it resolves to `null` after timeout and the downstream code falls back to an empty payload. The rest of the UI renders normally.

Per-endpoint timeouts:
- `/api/events` 45s — gives the cold load time to complete
- `/api/satellites` 12s — degrade gracefully if TLE upstream is slow
- `/api/cameras` 8s — should be sub-second
- `/api/news` / `/api/intel` 12s

## Lesson

In any `Promise.all`, if you don't guard every promise with a timeout or catch, **one slow promise can hang the whole UI**. Either:
- Always `.catch()` non-critical fetches
- Or use a `Promise.race` against `setTimeout` wrapper like above

The wrapper pattern is cleaner because it normalizes "timeout" and "error" into the same null-payload outcome.

## Verification

After fix:
- Page loads with cameras visible even if `/api/satellites` is timing out
- Aircraft telemetry populates from `/api/events`
- Satellite layer stays empty until TLE API recovers (graceful degradation)
- 5 cameras stream continuously in the right column

## Related

- [[Features/Live Cameras]]
- [[Architecture/Data Flow]]
- [[Bug Fixes/Satellite API hanging]]
