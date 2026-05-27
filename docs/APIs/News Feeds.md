---
title: News Feeds
tags: [apis, news, rss]
date: 2026-05-26
---

# News RSS Feeds

22 RSS feeds across 9 categories. All ingested by `parse_rss()` in `matrix_server.py`.

## Feed list

| Category | Source | URL |
|---|---|---|
| **world** | BBC World | `feeds.bbci.co.uk/news/world/rss.xml` |
| **world** | Reuters World | `reutersagency.com/feed/?best-regions=...&post_type=best` |
| **world** | DW World | `rss.dw.com/rdf/rss-en-world` |
| **world** | France24 | `france24.com/en/rss` |
| **world** | Guardian World | `theguardian.com/world/rss` |
| **world** | CNN Top Stories | `rss.cnn.com/rss/cnn_topstories.rss` |
| **us** | NPR News | `feeds.npr.org/1001/rss.xml` |
| **business** | CNBC Business | `cnbc.com/id/10001147/device/rss/rss.html` |
| **tech** | Wired | `wired.com/feed/rss` |
| **tech** | Hacker News | `hnrss.org/frontpage` |
| **science** | NASA Breaking | `nasa.gov/news-release/feed/` |
| **defense** | Defense News | `defensenews.com/arc/outboundfeeds/rss/?outputType=xml` |
| **ai** | TechCrunch AI | `techcrunch.com/category/artificial-intelligence/feed/` |
| **ai** | MIT Tech Review | `technologyreview.com/feed/` |
| **ai** | VentureBeat AI | `venturebeat.com/category/ai/feed` |
| **ai** | OpenAI News | `openai.com/news/rss.xml` |
| **ai** | NVIDIA Blog | `blogs.nvidia.com/feed/` |
| **ai** | The Decoder | `the-decoder.com/feed/` |
| **ai** | Marktechpost | `marktechpost.com/feed/` |
| **ai** | Hugging Face | `huggingface.co/blog/feed.xml` |
| **ai** | Synced Review | `syncedreview.com/feed/` |
| **ai** | Apple ML | `machinelearning.apple.com/rss.xml` |
| **california** | LA Times California | `latimes.com/california/rss2.0.xml` |
| **california** | CalMatters | `calmatters.org/feed/` |
| **california** | KCRA Sacramento | `kcra.com/topstories-rss` |
| **california** | KRON4 Bay Area | `kron4.com/news/feed/` |
| **california** | Berkeleyside | `berkeleyside.org/feed` |

## California breaking-only filter

CA feeds go through this keyword regex BEFORE being added:

```python
CALIFORNIA_BREAKING_RE = re.compile(
    r"\b(breaking|urgent|emergency|killed|dead|fatal|shooting|gunman|shot|stabbed|"
    r"earthquake|quake|wildfire|fire|flood|tsunami|landslide|evacuat|"
    r"crash|collision|explosion|blast|raid|arrest|indictment|conviction|verdict|"
    r"murder|stabbing|kidnap|attack|hostage|riot|protest|missing|amber\s*alert|"
    r"power\s*outage|outage|shutdown|state\s*of\s*emergency|disaster|"
    r"officer-involved|police\s*shoot|robber|assault)\b",
    re.IGNORECASE,
)
```

Only CA items whose title or summary matches survive. Drops mundane local news, keeps major breaking events.

## Per-category cap

After all feeds are parsed, items are sorted newest-first, then category-balanced:

```python
PER_CATEGORY_CAPS = {"ai": 26, "california": 6}
DEFAULT_CAP = 14
```

So AI gets the largest slice (26 items), California is small (6 items, already keyword-filtered), and everything else gets 14. Total caps at 120 items.

## Image extraction priority

`parse_rss()` looks for thumbnails in this order:
1. `<media:thumbnail url="...">`
2. `<media:content url="...">`
3. `<enclosure type="image/*" url="...">`
4. First `<img src="...">` in `<content:encoded>` HTML
5. First `<img src="...">` in `<description>` HTML

Tracking pixels are rejected (URLs containing "1x1" or "pixel" or ending in `.gif`).

## Content extraction

For richer card text, parser pulls from `<content:encoded>` first (full article HTML), strips tags, capped at 800 chars. Falls back to `<description>` if content:encoded is missing.

## Removed feeds

- **Al Jazeera** — removed by user request
- **VentureBeat AI** trailing slash — fixed (`/feed` not `/feed/`)

## Failed feed handling

Each feed wrapped in:

```python
try:
    xml_text = fetch_text(url, timeout=10)
    parsed = parse_rss(...)
    items.extend(parsed)
except (URLError, HTTPError, TimeoutError, OSError, ET.ParseError, ...):
    errors.append(f"{source}: {exc}")
```

Errors are stored in the payload's `errors` array, never block the response.

## Subprocess curl fallback

`fetch_text()` uses urllib first, falls back to `subprocess.run(["curl", ...])` on HTTPError. Some feeds (Reuters, Defense News) reject stock urllib by TLS fingerprint but accept curl with a browser User-Agent.

## Related

- [[Architecture/Backend Server]]
- [[APIs/External APIs]]
- [[Features/Breaking Newswire]]
