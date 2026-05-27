---
title: AI Voice Agent
tags: [feature, tts, audio, voice]
date: 2026-05-26
---

# AI Voice Agent

Toggle in the header. When ON, **British female voice reads every breaking-news popup headline aloud**. Off by default; preference persists in `localStorage`.

## Voice source: Google Translate TTS proxy

Primary path uses our `/api/tts` server endpoint which proxies Google Translate's free `translate_tts` endpoint:

```
client                 server                 google
  ↓                      ↓                      ↓
new Audio("/api/tts?lang=en-GB&text=Breaking%20news.%20...")
  ─────────────────────→ GET /api/tts
                          curl https://translate.google.com/translate_tts
                          ?ie=UTF-8&tl=en-GB&client=tw-ob&q=...
                            ─────────────────────→ audio/mpeg 64kbps mono 24kHz
                          ←─────────────────────────── MP3 bytes
                         (chunks of <= 190 chars stitched)
  ←───── audio/mpeg ──── 
audio.play()
```

### Why this proxy approach

- **Free** — no API key required
- **High quality** — Google's neural TTS, sounds professional
- **Female en-GB** — accent of choice
- **CORS-clean** — proxied through our origin so the browser is happy
- **`curl` not `urllib`** — Google returns 401 to stock urllib but 200 to curl with a browser User-Agent. Curl shell-out is the workaround. Curl is installed in our Railway nixpacks setup.

### Chunking long headlines

Google's per-request limit is ~190 characters. Server splits at punctuation:

```python
def chunk(t, limit=190):
    parts = []
    buf = ""
    for piece in re.split(r"(?<=[.!?,;:])\s+", t):
        if len(buf) + len(piece) + 1 <= limit:
            buf = (buf + " " + piece).strip()
        else:
            if buf: parts.append(buf)
            buf = piece
    if buf: parts.append(buf)
    return parts
```

Each chunk is fetched as a separate MP3 then concatenated server-side. The browser sees one seamless `audio/mpeg` stream.

## Fallback: local SpeechSynthesis (Daniel)

If `/api/tts` returns an error or play() fails, fallback uses the browser's built-in Web Speech API:

```js
function pickPreferredVoice() {
  const voices = speechSynthesis.getVoices();
  const british = voices.filter(v => /^en-GB/i.test(v.lang) || /UK|British/i.test(v.name));
  // Prefer in order: Daniel, Kate, Serena, Hazel, Eva, Susan, Shelley, Sandy, Flo, Reed, Google UK English, George
  for (const re of [/\bDaniel\b/i, /\bKate\b/i, /\bSerena\b/i, ...]) {
    const hit = british.find(v => re.test(v.name));
    if (hit) return hit;
  }
  return british[0] || voices[0];
}
```

On macOS this lands on **Daniel** (the iconic BBC-style male voice). On other systems it tries to find a polished British female (Kate, Hazel, Susan, Shelley) before falling back to whatever en-GB voice is installed.

## State

```js
state.voiceEnabled = localStorage.getItem("matrix.voiceEnabled") === "1"
state.voicePreferred = null  // cached after first pickPreferredVoice() call
const liveVoiceAudios = new Set()  // every Audio element ever created
```

## Toggle UI

Button in header. When ON:
- Violet chrome (background gradient + border)
- Pulsing red "REC" dot in the top-right corner of the button
- Text: "Voice On"

When OFF:
- Default neutral chrome
- Text: "AI Voice"

State persisted to `localStorage` so it survives across reloads.

## Interruption logic (the dual-voice fix)

The non-trivial part: when a new headline arrives while the previous one is still speaking, we must stop the old audio cleanly without triggering a fallback to SpeechSynthesis. See [[Bug Fixes/Dual voice playback]] for the original bug.

```js
const liveVoiceAudios = new Set();

function stopActiveVoice() {
  for (const handle of liveVoiceAudios) {
    handle.suppressFallback = true;
    try {
      handle.audio.onerror = null;
      handle.audio.onended = null;
      handle.audio.pause();
      handle.audio.currentTime = 0;
      handle.audio.src = "";
      handle.audio.load();
    } catch (_) {}
  }
  liveVoiceAudios.clear();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

function speakHeadline(text) {
  if (!state.voiceEnabled) return;
  stopActiveVoice();
  const phrase = `Breaking news. ${text}`;
  const audio = new Audio(`/api/tts?lang=en-GB&text=${encodeURIComponent(phrase)}`);
  audio.volume = 0.9;
  const handle = { audio, suppressFallback: false };
  liveVoiceAudios.add(handle);

  audio.addEventListener("ended", () => liveVoiceAudios.delete(handle), { once: true });
  audio.addEventListener("error", () => {
    liveVoiceAudios.delete(handle);
    if (!handle.suppressFallback) fallbackSpeak(phrase);
  }, { once: true });
  audio.play().catch(() => {
    if (!handle.suppressFallback) fallbackSpeak(phrase);
  });
}
```

The `suppressFallback` flag is flipped BEFORE clearing `src`, so the resulting error event silently no-ops instead of triggering Daniel.

## What you hear

Toggle on → confirmation phrase plays:
> *"Breaking news. AI voice agent activated. Standing by for breaking headlines."*

(The activation phrase intentionally starts with "Breaking news" so the user hears how a real headline will sound.)

Subsequent breaking-news popups play:
> *"Breaking news. {headline title}"*

In a clean polished British female voice.

## Browser unlock

`SpeechSynthesis.speak()` and `audio.play()` both need a user gesture before they'll work. The voice button click itself is the gesture — clicking ON immediately unlocks both engines. No invisible workarounds needed.

## Related

- [[Features/Breaking News Popup]]
- [[Features/Alert Sounds]]
- [[Bug Fixes/Dual voice playback]]
- [[APIs/Internal Endpoints]]
