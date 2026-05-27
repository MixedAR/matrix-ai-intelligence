---
title: YouTube Video Cards
tags: [feature, youtube, video, ai, poe2]
date: 2026-05-26
---

# YouTube Video Cards

Two topic-filtered streams of YouTube videos pulled via per-channel Atom RSS — appear inline in the newswire rail alongside news cards.

## Two streams

### AI videos (`/api/videos/ai`)

**9 channels**: AI Explained, Lex Fridman, MKBHD, Matt Wolfe, OpenAI, Google AI, AI Daily Brief, Wes Roth, Fireship

**Keyword filter** (`AI_VIDEO_KEYWORDS` regex):
```
openai, codex, ai agent, agentic, agent[s], hermes, deepseek, model[s],
claude, chatgpt, gpt-N, llm, llama, mistral, gemini, reasoning
```

Only videos whose title OR description match are kept.

**Time window**: 48 hours upstream (the strict keyword filter thins the result; wider net needed)

### POE2 videos (`/api/videos/gaming`)

**9 channels**: Palsteron, Moxsy, ExiledAgain, Path of Exile official, Jorgen, Fubgun, P4wnyhof, GhazzyTV, IGN

**Keyword filter** (`GAMING_VIDEO_KEYWORDS` regex):
```
path of exile 2, poe 2, poe2
```

Strict — only POE2 videos appear, even from IGN (the catch-all gaming channel).

**Time window**: 24 hours upstream

## Card layout

```
┌────────────────────────────────────┐
│                                    │
│       YouTube hqdefault.jpg        │   ← thumbnail (156px tall)
│              ▶                     │   ← play button overlay (cyan ring)
│  SOURCE                  5m        │   ← source pill + time pill
├────────────────────────────────────┤
│  Video title (up to 2 lines)       │
│  Description preview (2 lines)     │
└────────────────────────────────────┘
```

Width: 360px. Total height: 218px (matches news cards).

## Click → inline playback

Clicking a video card opens [[Features/Webview Slide-out]] with the YouTube `/embed/` URL — video plays inline in the dashboard, no leaving the page.

```js
const embedUrl = `https://www.youtube.com/embed/${item.video_id}?autoplay=1`;
// passed via data-embed attribute on the card
```

## Source: free YouTube channel RSS

No API key needed. Every YouTube channel has a public Atom feed at:
```
https://www.youtube.com/feeds/videos.xml?channel_id={UC...}
```

Returns the latest 15 videos with title, description, publish date, and `media:thumbnail` URL.

## Server parser

```python
def fetch_youtube_channel_feed(channel_id, source, category, max_age_minutes, keyword_filter=None):
    url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
    xml_text = fetch_text(url, timeout=6)
    root = ET.fromstring(xml_text)
    ns = {
        "a": "http://www.w3.org/2005/Atom",
        "yt": "http://www.youtube.com/xml/schemas/2015",
        "media": "http://search.yahoo.com/mrss/",
    }
    cutoff = datetime.now(timezone.utc).timestamp() - max_age_minutes * 60
    out = []
    for entry in root.findall("a:entry", ns):
        video_id = entry.find("yt:videoId", ns).text
        title = strip_html(entry.find("a:title", ns).text)
        pub = entry.find("a:published", ns).text
        pub_dt = datetime.fromisoformat(pub.replace("Z", "+00:00"))
        if pub_dt.timestamp() < cutoff: continue

        desc = strip_html(entry.find("media:group/media:description", ns).text or "")

        # Topic filter
        if keyword_filter is not None and not keyword_filter.search(f"{title} {desc}"):
            continue

        out.append({
            "id": f"yt-{category}-{video_id}",
            "source": source, "category": category,
            "title": title, "summary": desc[:240],
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "video_id": video_id,
            "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
            "time": pub_dt.isoformat(),
            "kind": "video",
        })
    return out
```

## Parallel channel fan-out

`build_videos_payload()` uses `ThreadPoolExecutor(max_workers=8)` to hit all 9 channels simultaneously. Per-region timing drops from sequential ~30s to parallel ~2s.

## Client poll cadence

Every **15 minutes**:
```js
setInterval(pollYouTubeVideos, 15 * 60 * 1000);
```

When new video IDs arrive that weren't in `state.seenVideoIds`:
- Added to `state.freshVideoIds`
- "JUST IN" badge appears on the card
- One-shot `playAlertSound("video")` rising arpeggio
- After 6s, fresh flag cleared

## 2-hour TTL in the rail

The newswire rail filters out video items older than 2 hours (`isFresh()` in `renderNews()`), even though the server keeps a wider window. Operator only sees videos that just dropped.

## Server-side cache

`VIDEOS_CACHE_TTL_SECONDS = 300` (5 minutes). Client polls every 15 min, server cache is shorter so two clients hitting at different times don't share stale data unnecessarily.

## Related

- [[APIs/YouTube Channels]]
- [[Features/Webview Slide-out]]
- [[Features/Breaking Newswire]]
