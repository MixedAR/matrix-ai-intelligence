---
title: Local Development
tags: [deployment, dev]
date: 2026-05-26
---

# Local Development

## Run locally

```bash
cd "/Users/stevecaudle/Matrix-AI-Intelligence app"
python3 matrix_server.py
```

Server binds to `0.0.0.0:8000` (or `$PORT` if set). Open `http://127.0.0.1:8000/`.

## Custom port

```bash
PORT=9000 python3 matrix_server.py
```

## Requirements

- Python 3.10+ (we target 3.12 on Railway)
- `curl` in PATH (required for TTS proxy + RSS subprocess fallback — comes pre-installed on macOS / most Linux)

No `pip install` needed — entire backend uses Python stdlib only.

## File watching / hot reload

None built in. Edit files → kill (Ctrl-C) → restart. Sub-second restart since there are no imports beyond stdlib.

For frontend changes (HTML/CSS/JS), the browser cache may stick — force-refresh with Cmd+Shift+R / Ctrl+Shift+R.

## Useful endpoints during dev

| Endpoint | When to use |
|---|---|
| `http://127.0.0.1:8000/` | Main dashboard |
| `http://127.0.0.1:8000/api/cameras` | Quick smoke test (should return 5 cameras instantly) |
| `http://127.0.0.1:8000/api/news?ts=$(date +%s)` | Cache-busting fresh news fetch |
| `http://127.0.0.1:8000/api/tts?lang=en-GB&text=hello` | Test the TTS proxy returns valid MP3 |
| `http://127.0.0.1:8000/api/events` | Full data dump — slow first call (16-30s) then fast |

## Debugging

### Logs

Server logs to stdout. Tail it via:

```bash
python3 matrix_server.py 2>&1 | tee /tmp/matrix.log
# in another shell:
tail -f /tmp/matrix.log
```

### Browser console

DevTools → Console. Look for:
- Three.js init warnings (usually safe)
- Failed fetches (red XHR/fetch entries)
- SpeechSynthesis errors (TTS path)

### Inspect cache TTLs

The 5 module-level caches in `matrix_server.py`:
```python
cache               # /api/events       TTL 55s
satellite_cache    # /api/satellites    TTL 300s
news_cache         # /api/news          TTL 45s
intel_cache        # /api/intel         TTL 90s
videos_ai_cache    # /api/videos/ai     TTL 300s
videos_gaming_cache # /api/videos/gaming TTL 300s
```

To force a fresh load, restart the server (caches are in-memory only).

## Common dev tasks

### Add a new RSS feed

Edit `NEWS_FEEDS` list in `matrix_server.py`. Add tuple of `("Source Name", "url", "category")`. Test with `curl http://127.0.0.1:8000/api/news` — should appear in the items list.

### Add a new globe layer

1. Append to `layers[]` array in `app.js` (id, label, detail, color)
2. Write a `load_*` loader in `matrix_server.py` that pushes events with `layer="your-id"`
3. Add to the `for loader in (...)` tuple in `build_payload()`
4. Optionally add an icon case in `drawLayerIcon()` in `app.js`

### Tweak a color

Edit `:root` CSS custom properties in `styles.css`. Live-reload by force-refreshing.

### Add a new YouTube channel

Append to `AI_YT_CHANNELS` or `GAMING_YT_CHANNELS` tuple list in `matrix_server.py`. Each entry is `("Display Name", "UC...channel_id")`.

To find a channel ID, scrape from search results — see [[APIs/YouTube Channels]].

## Related

- [[Deployment/Railway Setup]]
- [[Architecture/File Structure]]
