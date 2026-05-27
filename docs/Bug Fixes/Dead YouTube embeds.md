---
title: Bug — Dead YouTube camera embeds
tags: [bug, cameras, youtube]
date: 2026-05-26
---

# Bug · Dead YouTube camera embeds

**Symptom (original)**: the "live video feeds at the bottom are not live." Two YouTube embeds in the camera dock were dead (Times Square + Tokyo Shibuya).

## Investigation

Probed each video ID's playability:

```bash
curl -sL "https://www.youtube.com/watch?v=2E22geZeZDA" | grep -oE '"playabilityStatus":\{[^}]*' | head -3
# → "playabilityStatus":{"status":"UNPLAYABLE","reason":"This live stream recording is not available."

curl -sL "https://www.youtube.com/watch?v=3kPH7kTphnE" | grep -oE '"playabilityStatus":\{[^}]*' | head -3
# → "playabilityStatus":{"status":"LOGIN_REQUIRED","messages":["This is a private video..."]}
```

- Times Square (2E22geZeZDA) — stream ended, recording removed
- Tokyo Shibuya (3kPH7kTphnE) — channel made it private

The other three slots (Abbey Road, Venice Rialto, Miami) only had `liveUrl` but no `embedUrl`, so they showed static thumbnails instead of live video.

## Initial fix

Found working 24/7 live streams via YouTube's `live`-filtered search:

```bash
curl -sL "https://www.youtube.com/results?search_query=times+square+live+camera&sp=EgJAAQ%253D%253D" |
  grep -oE '"videoId":"[a-zA-Z0-9_-]{11}"'
```

For each candidate, verified `"isLive":true` + `"status":"OK"` + checked embeddability via `oembed`:

```bash
curl https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={ID}&format=json
```

Replacement set:

| Camera | New stream | Channel |
|---|---|---|
| Times Square | z-jYdOIKcTQ | EarthCam |
| Tokyo Shibuya | dfVK7ld38Ys | FNN Prime Online |
| Abbey Road | M3EYAY2MftI | EarthCam |
| Venice Rialto | CMn6xQXuSjI | I Love You Venice |
| Miami | 4UzQd1dVPlo | Ozolio Live |

All five also got proper `embedUrl` so they play inline, not just show thumbnails.

## Subsequent swap (user request)

User later asked to replace globally-scattered cameras with Bay Area only:
- SF Downtown
- SF-Oakland Bay Bridge
- Golden Gate / SF Skyline
- Pier 39 / Fisherman's Wharf
- US-101 / Santa Clara Valley

Same verification process — find live + embeddable. See current set in [[Features/Live Cameras]].

## Why YouTube live streams die

- Channel ends the broadcast (becomes a VOD that may or may not stay public)
- Channel privates the video
- Stream goes offline temporarily (network at the source)
- Copyright strike removes the video

YouTube has no public "is this stream live RIGHT NOW" API for embeds — the embedded player will simply show "Video unavailable" if the source dies.

## Mitigation strategy

For long-term reliability:
1. Pick streams from **major news orgs** (ABC7, EarthCam, etc.) — least likely to disappear suddenly
2. Have a **fallback list** ready in case any of the 5 dies
3. Periodically re-verify embed health via oembed

Not yet automated, but would be a future enhancement.

## Related

- [[Features/Live Cameras]]
