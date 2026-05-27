---
title: Crypto + HN Top Bars
tags: [feature, ticker, frontend]
date: 2026-05-26
---

# Crypto + Hacker News Top Bars

Two thin strips between the header and the dashboard, full-width.

## Crypto bar

Single row of 6 evenly-spaced coins with price + 24h change %.

```
┌────────────────────────────────────────────────────────────────────────┐
│ CRYPTO │ BTC $75,910 -1.78% │ ETH $2,872 -3.71% │ USDT $0.999 -0.10% │
│        │ BNB $655 -1.13% │ XRP $1.33 -1.74% │ USDC $0.999 -0.08%    │
└────────────────────────────────────────────────────────────────────────┘
```

Labels in JetBrains Mono. Deltas color-coded: green (#4df2c8) for `up`, red (#ff3d4f) for `down`.

### Data

Pulled from `/api/intel` → CoinGecko `coins/markets?vs_currency=usd&per_page=6` widget.

### Render

```js
function renderCryptoBar() {
  const widget = state.intel.find(w => w.kind === "crypto");
  if (!widget) return;
  els.cryptoBarTrack.innerHTML = widget.items.map((c) => {
    const change = Number(c.change);
    const cls = change >= 0 ? "up" : "down";
    return `
      <div class="crypto-tile" title="${c.name}">
        <span class="sym">${c.symbol.toUpperCase()}</span>
        <span class="price">$${formatPrice(c.price)}</span>
        <span class="delta ${cls}">${change >= 0 ? "+" : ""}${change?.toFixed(2)}%</span>
      </div>
    `;
  }).join("");
}
```

Each `.crypto-tile` is `flex: 1 1 0` so they share the row width evenly. Right border separator between tiles. Container is `overflow: hidden` so it never grows.

## Hacker News ticker

Continuous-scrolling marquee of Hacker News top stories.

```
┌────────┬──────────────────────────────────────────────────────────────┐
│ HN TOP │ 142▲ Bypassed Adobe and Microsoft to Build a Git-Tracked... │
│        │ 89▲ A few interesting modern pixel fonts · 51▲ ...           │  (scrolls left)
└────────┴──────────────────────────────────────────────────────────────┘
```

### Data

`/api/intel` → Hacker News Firebase API → top 6 stories with score + title + URL.

### CSS marquee

```css
.hn-ticker-track-inner {
  display: flex;
  align-items: center;
  gap: 36px;
  white-space: nowrap;
  padding-left: 100%;
  animation: hnMarquee 80s linear infinite;
}

@keyframes hnMarquee {
  from { transform: translateX(0); }
  to   { transform: translateX(-100%); }
}

.hn-ticker:hover .hn-ticker-track-inner {
  animation-play-state: paused;
}
```

### Render — duplicate the content for seamless looping

```js
function renderHnTicker() {
  const widget = state.intel.find(w => w.kind === "hn");
  const item = (s) =>
    `<a href="${s.url}" target="_blank" rel="noreferrer">
       <strong>${s.score || 0}▲</strong>${s.title}
     </a>`;
  const html = widget.items.map(item).join("");
  els.hnTickerTrack.innerHTML = `<div class="hn-ticker-track-inner">${html}${html}</div>`;
}
```

Each story is a link with a small orange score badge (`142▲`) followed by the title. Pauses on hover so you can read / click.

## Why "top bars" and not sidebar widgets

Previously crypto + HN were widgets in the left **Intel Widgets** panel. User asked: "lets take crypto and build out a nice bar on top, move it off side. Put hacker news in a small scrolling ticker at top under crypto info."

Moving them out of the sidebar:
- Gave the sidebar more vertical space for the layer toggles + remaining widgets
- Made markets data glanceable across the full width
- Added visual life via the HN marquee scroll

`renderIntel()` now filters them out of the sidebar:
```js
const sidebarWidgets = state.intel.filter(w => w.kind !== "crypto" && w.kind !== "hn");
```

Crypto + HN are rendered via dedicated `renderCryptoBar()` + `renderHnTicker()` instead.

## Related

- [[APIs/External APIs]]
- [[Features/Intel Widgets]]
