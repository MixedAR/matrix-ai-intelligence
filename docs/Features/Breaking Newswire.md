---
title: Breaking Newswire
tags: [feature, news, ticker, frontend]
date: 2026-05-26
---

# Breaking Newswire

The horizontal-scrolling rail at the bottom of the dashboard. Single merged feed of:
- RSS news stories (8 world + 5 AI + 5 California + 4 misc = **22 feeds**)
- Topic-filtered YouTube AI videos
- Topic-filtered YouTube POE2 videos

All sorted newest-first, capped at a **2-hour TTL** so the rail only shows currently-fresh content.

## Card layout

Two card types share the same 560px × 218px footprint:

**News card** — image-left layout (180px image column + body column)
```
┌────────────┬─────────────────────────────────────┐
│   thumb    │  SOURCE             |     2m ago    │
│   (180px)  │                                     │
│            │  Headline (up to 3 lines)           │
│            │                                     │
│            │  Summary (up to 5 lines of body...) │
└────────────┴─────────────────────────────────────┘
```

**Video card** — image-top layout
```
┌──────────────────────────────────────────────────┐
│              YouTube thumbnail                   │
│         ▶ play button overlay (cyan)             │
│  SOURCE                              5m          │
├──────────────────────────────────────────────────┤
│  Video title (up to 2 lines)                    │
│  Description preview                            │
└──────────────────────────────────────────────────┘
```

## Category color coding

Each card's left border + meta text uses the category color:

| Category | Color | Where it shows |
|---|---|---|
| `world` | accent-2 magenta | BBC, Reuters, CNN, France24, etc |
| `us` | accent-2 magenta | NPR News |
| `tech` | cyber green | Wired, Hacker News |
| `business` | gold | CNBC |
| `science` | accent blue | NASA |
| `defense` | danger red | Defense News |
| `ai` | violet (#b56cff) | TechCrunch AI, MIT Tech Review, The Decoder, etc |
| `california` | gold | LA Times, CalMatters, KCRA, KRON4, Berkeleyside |
| `ai-video` | cyber green | YouTube AI clips |
| `gaming-video` | magenta | YouTube POE2 clips |

## 2-hour TTL

Client-side filter in `renderNews()`:

```js
const CARD_MAX_AGE_MS = 2 * 60 * 60 * 1000;

function isFresh(item) {
  const ts = eventTimestamp(item.time);
  return Date.now() - ts < CARD_MAX_AGE_MS;
}
```

Items older than 2 hours are filtered out before rendering. Server still returns up to 48 hours of items so when a card ages out, the next render swaps in something newer.

## Step-scroll ticker (every 30 seconds)

Built with `setInterval`, NOT a CSS animation, so we can pause cleanly:

```js
const NEWS_STEP_INTERVAL_MS = 30000;

function startNewsTicker() {
  els.newsTrack.addEventListener("pointerenter", () => { newsTickerHovered = true; });
  els.newsTrack.addEventListener("pointerleave", () => { newsTickerHovered = false; });

  setInterval(() => {
    if (newsTickerHovered) return;
    const track = els.newsTrack;
    const firstCard = track.querySelector(".news-card, .video-card");
    if (!firstCard) return;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 10;
    const step = firstCard.offsetWidth + gap;
    let target = track.scrollLeft + step;
    if (target >= track.scrollWidth - track.clientWidth - 4) target = 0;
    track.scrollTo({ left: target, behavior: "smooth" });
  }, NEWS_STEP_INTERVAL_MS);
}
```

Each 30s tick advances exactly one card width with smooth-scroll animation. Pauses on hover.

## Idempotent rendering

`renderNews()` computes a content signature before touching the DOM:

```js
const sig = `${minuteBucket}|${freshTag}|` + slice.map(i => i.id).join(",");
if (sig === renderedNewsSignature) return;  // no-op
```

- **`minuteBucket`** — `Math.floor(Date.now() / 60000)` so relative-time labels still update once per minute
- **`freshTag`** — encodes how many items have the "JUST IN" flash so animation kicks in correctly
- **Item IDs** — actual content fingerprint

This eliminated the 25-second flicker that was happening on every news poll. See [[Bug Fixes/Camera iframe reload flicker]] for the parallel camera fix.

## Newest-on-the-left guarantee

When a new item arrives:
1. `detectBreakingNews()` adds it to `state.pendingNews`
2. Popup shows for 30 seconds
3. On dismiss → item promoted to `state.news`, flagged in `state.freshNewsIds`
4. `renderNews()` re-renders with the item at index 0 (newest-first sort)
5. `els.newsTrack.scrollTo({ left: 0, behavior: "smooth" })` snaps the rail back so the new card is the leftmost visible
6. The card animates in with `.is-new` class:
   - Slide-in from `translateX(-60px)` to `translateX(0)` with scale
   - 6-second `newCardFlash` border + box-shadow glow
   - "JUST IN" badge pulses 6 times in the top-left corner

See [[Features/Breaking News Popup]] for the popup → rail handoff.

## Click → webview

Every card carries `data-news-card="true"`. The shared click handler opens [[Features/Webview Slide-out]] with the source URL (or the YouTube embed URL for videos).

## Source feed cadence

| Refresh | What |
|---|---|
| Every **25s** | `pollNews()` re-fetches `/api/news` + `/api/intel` |
| Every **15min** | `pollYouTubeVideos()` re-fetches AI + POE2 video lists |
| Every **60s** | Full `loadEvents()` refresh (includes news) |

Server-side cache TTLs (45s news, 90s intel, 300s videos) keep upstream load reasonable.

## Related

- [[Features/Breaking News Popup]]
- [[APIs/News Feeds]]
- [[APIs/YouTube Channels]]
- [[Features/Webview Slide-out]]
- [[Bug Fixes/Camera iframe reload flicker]]
