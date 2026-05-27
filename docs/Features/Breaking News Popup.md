---
title: Breaking News Popup
tags: [feature, news, popup, frontend]
date: 2026-05-26
---

# Breaking News Popup

When a never-seen news item arrives via the poll, a magenta-bordered "BREAKING" toast slides up at the bottom-center, above the newswire rail, with a downward-pointing caret aimed at the rail.

## Visual

```
┌──────────────────────────────────────────────────┐
│ [● BREAKING]  CNN TOP STORIES                  × │
│                                                  │
│  Russian authorities detain suspect over         │
│  St. Petersburg cafe blast                       │
│                                                  │
│  Russian authorities have detained a suspect... │
│                                                  │
│  Open story →                          just now │
│                                                  │
│  ▰▰▰▰▰▰▰▰▰▰▱▱▱▱  ← countdown bar (30s)         │
└────────────────▼────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │  News rail      │
        └─────────────────┘
```

## Queue behavior

To prevent multiple popups stacking, we use a **pending queue**:

```js
state.pendingNews = []       // items waiting to pop up
state.seenNewsIds = new Set()
state.newsBootstrapped = false  // first load doesn't fire popups
```

Flow per [[Architecture/Data Flow]]:

```
pollNews() fetches /api/news → items[]
  ↓
detectBreakingNews(items):
  • on first load: bootstrap seenNewsIds without firing popups
  • on subsequent: identify items NOT in seenNewsIds → pendingNews.push(...)
  • state.news = rawNews − pendingNews   (rail withholds queued items)
  ↓
showNextBreakingPopup():
  • peek head of pendingNews (no pop yet)
  • render popup with title, source, summary, "Open story →", countdown bar
  • play "breaking-news" alert sound (3-tone urgent beep)
  • speakHeadline(title) via TTS proxy (if AI Voice toggled on)
  • setTimeout(30s) → dismissBreakingPopup(promote=true)
  ↓
30s elapsed (or × clicked):
  • shift item out of pendingNews
  • state.freshNewsIds.add(item.id)
  • state.news = rawNews − pendingNews   (item now in rail)
  • renderNews() — item appears at position 1
  • snap rail to scrollLeft=0
  • after 5.5s, clear fresh flag, re-render normally
  • if pendingNews still has items → showNextBreakingPopup() again
```

## 30-second countdown bar

A CSS-only progress bar that drains over 30 seconds via `transform: scaleX`:

```css
.breaking-progress::after {
  content: "";
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--accent-2), var(--cyber));
  transform-origin: left;
  animation: breakingCountdown 30s linear forwards;
}

@keyframes breakingCountdown {
  from { transform: scaleX(1); }
  to   { transform: scaleX(0); }
}
```

The animation runs in the browser, the 30s `setTimeout` is the JS-side authoritative dismissal.

## Caret pointing to the news rail

```css
.breaking-popup::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -8px;
  width: 14px; height: 14px;
  background: linear-gradient(135deg, rgba(28, 6, 14, 0.94), rgba(8, 12, 22, 0.96));
  border-right: 1px solid var(--accent-2);
  border-bottom: 1px solid var(--accent-2);
  transform: translateX(-50%) rotate(45deg);
}
```

A rotated square stub gives the "this came from down there" visual cue.

## Click × to dismiss early

Same `dismissBreakingPopup(promote=true)` path — the item still gets promoted to the rail with the "JUST IN" flash, just sooner.

## Esc to close

Global keydown handler closes the breaking popup (alongside event popup and webview).

## Sound integration

When the popup opens:
1. `playAlertSound("breaking-news")` — 3-tone urgent beep (square wave 980→1320→1760→880 Hz)
2. If AI Voice toggled on: `speakHeadline(title)` reads the headline in British female voice via [[Features/AI Voice Agent]]

## Animation

Slide-in from below with `translateY(16px) → 0` over 280ms, opacity 0 → 1, cubic-bezier(0.2, 0.85, 0.25, 1.05).

Slide-out reverses, then `.hidden` is added 280ms later.

## Related

- [[Features/Breaking Newswire]]
- [[Features/AI Voice Agent]]
- [[Features/Alert Sounds]]
