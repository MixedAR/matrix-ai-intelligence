---
title: Intel Widgets
tags: [feature, sidebar]
date: 2026-05-26
---

# Intel Widgets

Bottom of the left sidebar. After moving crypto + HN to the top bars, four widgets remain.

## Widgets

### USD FX Rates (ExchangeRate-API)
Currency conversion rates from USD to:
- EUR, GBP, JPY, CNY, INR, AUD

Source: `https://open.er-api.com/v6/latest/USD` (free, no auth)

### Wikipedia: In the news (Wikipedia Featured)
Top 5 current-events headlines from Wikipedia's daily featured feed:
- `https://en.wikipedia.org/api/rest_v1/feed/featured/YYYY/MM/DD`

Each item is a link to the relevant Wikipedia page.

### NASA Astronomy Picture (APOD)
- `https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY`
- Free `DEMO_KEY` works for low-traffic; APOD shows daily astronomy photo + explanation
- Renders the image (if media_type=image) at 86px tall + title + short explanation

### Next SpaceX Launch (SpaceX API)
- `https://api.spacexdata.com/v5/launches/next`
- Free, no auth
- Shows launch name + countdown (e.g. "T-12d 5h") + watch link

## What was moved out

- **Crypto Markets** (CoinGecko) → [[Features/Crypto + HN Top Bars|top bar]]
- **Hacker News Top** (HN API) → [[Features/Crypto + HN Top Bars|HN ticker]]

The widget data still comes through `/api/intel` — only the rendering changed.

## Render

`renderIntel()` filters by widget kind:

```js
function renderIntel() {
  renderCryptoBar();    // top bar
  renderHnTicker();     // top ticker
  const sidebarWidgets = state.intel.filter(w => w.kind !== "crypto" && w.kind !== "hn");
  els.intelPanel.innerHTML = sidebarWidgets.map(w => widgetHtml(w)).join("");
}
```

## Cache

90-second server cache (`intel_cache`). Client refreshes via `pollNews()` every 25s — fetches `/api/intel` alongside `/api/news`.

## Related

- [[APIs/External APIs]]
- [[Features/Crypto + HN Top Bars]]
