---
title: Webview Slide-out
tags: [feature, modal, iframe, frontend]
date: 2026-05-26
---

# Webview Slide-out

Click any news card or video card → a panel slides in from the left containing an iframe with the source page (or YouTube embed). Keep operators in-app instead of bouncing them to other tabs.

## Visual

```
┌──────────────────────────────────────────┬────── rest of dashboard ──────┐
│ ● CNN TOP STORIES                        │                               │
│ Russian authorities detain suspect over  │                               │
│ St. Petersburg cafe blast                │                               │
│                          [Open externally ↗] [CLOSE ×]                   │
│                                          │                               │
│ ┌──────────────────────────────────────┐ │                               │
│ │                                      │ │                               │
│ │   iframe loads the article          │ │                               │
│ │                                      │ │                               │
│ │                                      │ │                               │
│ │   (or YouTube /embed/ URL plays      │ │                               │
│ │   the video inline for video cards)  │ │                               │
│ │                                      │ │                               │
│ │   If the publisher blocks iframe     │ │                               │
│ │   via X-Frame-Options:               │ │                               │
│ │                                      │ │                               │
│ │     "This source blocks embedded     │ │                               │
│ │      preview — use the button above  │ │                               │
│ │      to open externally"             │ │                               │
│ │                                      │ │                               │
│ └──────────────────────────────────────┘ │                               │
└──────────────────────────────────────────┴───────────────────────────────┘
```

## HTML structure

```html
<aside id="webView" class="webview hidden" role="dialog" aria-modal="true">
  <header class="webview-head">
    <div class="webview-meta">
      <span class="webview-source">CNN TOP STORIES</span>
      <h2>Russian authorities detain suspect...</h2>
    </div>
    <div class="webview-actions">
      <a class="webview-btn" target="_blank">Open externally ↗</a>
      <button class="webview-btn webview-close">CLOSE ×</button>
    </div>
  </header>
  <div class="webview-body">
    <iframe sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-popups-to-escape-sandbox"
            referrerpolicy="no-referrer-when-downgrade"></iframe>
    <div class="webview-fallback hidden">
      <h3>This source blocks embedded preview</h3>
      <p>Some publishers (CNN, Reuters, NYT, etc.) explicitly forbid iframe display via their security headers. Use the button above to open in a new tab.</p>
    </div>
  </div>
</aside>
```

## Slide-in animation

```css
.webview {
  position: absolute;
  top: 8px; bottom: 8px; left: 8px;
  width: min(54vw, 920px);
  transform: translateX(-100%);
  opacity: 0;
  transition: transform 320ms cubic-bezier(0.2, 0.85, 0.25, 1.05), opacity 220ms ease;
}

.webview.open {
  transform: translateX(0);
  opacity: 1;
}
```

## Open / close controller

```js
function openWebView({ url, externalUrl, source, title }) {
  if (!url) return;
  els.webViewSource.textContent = source || "SOURCE";
  els.webViewTitle.textContent = title || url;
  els.webViewExternal.href = externalUrl || url;
  els.webViewFallback.classList.add("hidden");
  els.webViewFrame.src = url;

  // Detect iframe-load failure (X-Frame-Options blocked → load event never fires)
  let loaded = false;
  els.webViewFrame.addEventListener("load", () => loaded = true, { once: true });
  setTimeout(() => {
    if (!loaded) els.webViewFallback.classList.remove("hidden");
  }, 4000);

  els.webView.classList.remove("hidden");
  requestAnimationFrame(() => els.webView.classList.add("open"));
}

function closeWebView() {
  els.webView.classList.remove("open");
  setTimeout(() => {
    els.webView.classList.add("hidden");
    els.webViewFrame.src = "about:blank";
  }, 320);
}
```

## Iframe failure fallback

Most major news publishers (CNN, NYT, Reuters, WaPo) set `X-Frame-Options: DENY` or CSP `frame-ancestors 'none'` — their pages **cannot** be embedded.

Detection heuristic: after 4 seconds, if the iframe's `load` event hasn't fired, assume blocked → reveal the fallback panel:

```
┌──────────────────────────────────────┐
│  This source blocks embedded preview │
│                                      │
│  Some publishers (CNN, Reuters, NYT, │
│  etc.) explicitly forbid iframe      │
│  display via their security headers. │
│  Use the button above to open the    │
│  page in a new tab.                  │
└──────────────────────────────────────┘
```

The "Open externally ↗" button is always available regardless.

## Video cards = inline playback

Video cards pass an `embedUrl` like `https://www.youtube.com/embed/{VIDEO_ID}?autoplay=1`. YouTube allows embedding, so the video plays inline in the webview — operator can watch without leaving the dashboard.

## Click binding

Every card carries `data-news-card="true"` and reads these attributes:
- `data-url` — the source URL (for "Open externally" + iframe src on news)
- `data-embed` — YouTube embed URL (overrides URL on video cards)
- `data-source` — label for the header
- `data-title` — title for the header

```js
function bindCardClicks() {
  els.newsTrack.querySelectorAll("[data-news-card]").forEach((card) => {
    card.addEventListener("click", (e) => {
      e.preventDefault();
      const url = card.dataset.embed || card.dataset.url;
      const externalUrl = card.dataset.url;
      const source = card.dataset.source;
      const title = card.dataset.title;
      if (url) openWebView({ url, externalUrl, source, title });
    });
  });
}
```

## Dismissal

- Click `CLOSE ×` button
- Press `Esc` (global keydown listener)

`closeWebView()` slides out, sets src to `about:blank` so the iframe stops loading.

## Related

- [[Features/Breaking Newswire]]
