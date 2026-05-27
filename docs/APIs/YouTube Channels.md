---
title: YouTube Channels
tags: [apis, youtube, ai, poe2]
date: 2026-05-26
---

# YouTube Channels

The channel ID lists used by `/api/videos/ai` and `/api/videos/gaming`. Public Atom RSS, no API key needed.

## AI channels (9)

| Channel | UC ID | Why |
|---|---|---|
| AI Explained | `UCNJ1Ymd5yFuUPtn21xtRbbw` | Deep-dive AI explainers |
| Lex Fridman | `UCSHZKyawb77ixDdsGog4iWA` | Long-form AI interviews |
| MKBHD | `UCBJycsmduvYEL83R_U4JriQ` | Tech reviewer who covers major AI launches |
| Matt Wolfe | `UCJIfeSCssxSC_Dhc5s7woww` | Daily AI news roundups |
| OpenAI | `UCXZCJLdBC09xxGZ6gcdrc6A` | First-party OpenAI announcements |
| Google AI | `UCcefcZRL2oaA_uBNeo5UOWg` | First-party Google AI / DeepMind / Gemini |
| AI Daily Brief | `UC2WmuBuFq6gL08QYG-JjXKw` | Daily AI news podcast format |
| Wes Roth | `UCSv4qL8vmoSH7GaPjuqRiCQ` | AI news + opinion |
| Fireship | `UCMLtBahI5DMrt0NPvDSoIRQ` | Tech / AI dev content |

## POE2 channels (9)

Path of Exile 2 dedicated creators discovered via `youtube.com/results?search_query=path+of+exile+2&sp=EgIIAg` filtered to recent uploads:

| Channel | UC ID | Why |
|---|---|---|
| Palsteron | `UCXp5YOW329ysRDl_LK9P1_g` | POE2 build guides + meta |
| Moxsy | `UCqUYttljh7bvi6mvHzpiMIA` | POE2 build content |
| ExiledAgain | `UCqFftuISNP9zT2TFkHnDNJg` | POE2 news + patch notes |
| Path of Exile (official) | `UCA7X5unt1JrIiVReQDUbl_A` | Official GGG channel |
| Jorgen | `UCgpVs9wn5iFMBWFUSgf21Hw` | POE2 league starter content |
| Fubgun | `UCPC9EGNDaVOJJyavLfVQpZg` | POE2 build guides |
| P4wnyhof | `UCni5pNpPYvejsMn1yWDsMNA` | POE / POE2 streamer |
| GhazzyTV | `UCoZit1xdwD_46j8sZWRKhoA` | POE2 builds + theorycraft |
| IGN | `UCKy1dAqELo0zrOtPkf0eTMw` | General gaming news (filtered to POE2 only) |

## Keyword filters

### AI

```python
AI_VIDEO_KEYWORDS = re.compile(
    r"\b(open\s*ai|openai|codex|ai\s*agent|agentic|\bagent[s]?\b|hermes|deepseek|model[s]?|"
    r"claude|chatgpt|gpt-?\d|llm|llama|mistral|gemini|reasoning)\b",
    re.IGNORECASE,
)
```

User-specified topics: OpenAI, Codex, AI Agents, Hermes, Models, Deepseek — plus common adjacent terms (Claude, ChatGPT, LLM, Llama, Mistral, Gemini, reasoning).

### POE2

```python
GAMING_VIDEO_KEYWORDS = re.compile(
    r"(path\s*of\s*exile\s*2|\bpoe\s*2\b|\bpoe2\b)",
    re.IGNORECASE,
)
```

Strictly POE2 — no other games. Even IGN's gaming-news firehose is reduced to just POE2 coverage.

## Channel ID discovery

Channel IDs (those `UC...` strings) aren't exposed in YouTube's URLs anymore — modern channels use `/@handle` slugs. To find IDs, scrape the channel page:

```bash
curl -sL "https://www.youtube.com/results?search_query=path+of+exile+2&sp=EgIIAg" |
python3 -c "
import re, sys
txt = sys.stdin.read()
chans = re.findall(r'\"browseId\":\"(UC[a-zA-Z0-9_-]{22})\",\"canonicalBaseUrl\":\"(/@[A-Za-z0-9_.]+)\"', txt)
for cid, handle in set(chans):
    print(cid, handle)
"
```

## RSS endpoint format

```
https://www.youtube.com/feeds/videos.xml?channel_id={UC...}
```

Returns Atom XML with up to 15 most recent videos:
- `<yt:videoId>` — the 11-char video ID
- `<title>`, `<published>`, `<author>`
- `<media:group><media:description>` — full description
- `<media:thumbnail url="...">` — sometimes; we fall back to `i.ytimg.com/vi/{id}/hqdefault.jpg`

## Time windows

- AI: 48-hour upstream window
- POE2: 24-hour upstream window

Both wider than the client-side 2-hour rail TTL — wider net to ensure something always qualifies after keyword filtering.

## Per-channel resilience

Each channel fetch is wrapped in try/except. One slow / errored channel doesn't block the others. `ThreadPoolExecutor(max_workers=8)` runs all 9 in parallel — full payload completes in ~2 seconds.

## Related

- [[Features/YouTube Video Cards]]
- [[Features/Live Cameras]] (the 5 Bay Area YouTube embeds)
