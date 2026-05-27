---
title: Bug — Dual male+female voice playback
tags: [bug, audio, voice]
date: 2026-05-26
---

# Bug · Dual male+female voice playback

**Symptom**: when a new breaking-news headline arrived while the previous one was still speaking, both voices played simultaneously — the Google female voice for the new headline AND the local macOS Daniel (male) voice for the previous one.

## Root cause

`speakHeadline()` interrupted the previous audio by setting `audio.src = ""`. That assignment immediately fires the audio element's **`error`** event because an empty src is a load failure. The error listener — captured in the previous closure with its OWN `fellBack` flag still false — then called `fallbackSpeak(oldPhrase)`, which invoked **SpeechSynthesis with Daniel** while the new female audio was already playing.

```
old audio playing female: "Russian authorities detain suspect..."
                          ↓ new headline arrives
                          audio.src = ""       ← this fires error event
                                       ↓
                          error listener runs old fellBack closure
                                       ↓
                          fallbackSpeak("Russian authorities...")
                                       ↓
                          SpeechSynthesis Daniel reads OLD headline
                          ───────────────────────────────────────
                          new audio: "Breaking news. AI agents..."
                          AND fallback Daniel: "Russian authorities..."
                          PLAY AT THE SAME TIME
```

## Fix

Restructured the playback handling with a **Set + per-handle suppress flag**:

```js
const liveVoiceAudios = new Set();  // every Audio ever created

function stopActiveVoice() {
  for (const handle of liveVoiceAudios) {
    handle.suppressFallback = true;   // ← flip flag BEFORE clearing src
    try {
      handle.audio.onerror = null;     // belt-and-suspenders: detach listener
      handle.audio.onended = null;
      handle.audio.pause();
      handle.audio.currentTime = 0;
      handle.audio.src = "";
      handle.audio.load();              // force buffer release
    } catch (_) {}
  }
  liveVoiceAudios.clear();
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

function speakHeadline(text) {
  if (!state.voiceEnabled) return;
  stopActiveVoice();                    // ← silence EVERYTHING first
  const phrase = `Breaking news. ${text}`;
  const audio = new Audio(`/api/tts?lang=en-GB&text=${encodeURIComponent(phrase)}`);
  const handle = { audio, suppressFallback: false };
  liveVoiceAudios.add(handle);

  audio.addEventListener("ended", () => liveVoiceAudios.delete(handle), { once: true });
  audio.addEventListener("error", () => {
    liveVoiceAudios.delete(handle);
    if (handle.suppressFallback) return;   // ← skip fallback if we caused this
    handle.suppressFallback = true;
    fallbackSpeak(phrase);
  }, { once: true });
  audio.play().catch(() => {
    if (handle.suppressFallback) return;
    handle.suppressFallback = true;
    fallbackSpeak(phrase);
  });
}

function fallbackSpeak(phrase) {
  if (!state.voiceEnabled) return;   // ← also guard against stale toggle-off
  if (!("speechSynthesis" in window)) return;
  ...
}
```

### Critical pieces of the fix

1. **`handle` object instead of closure variable** — each playback gets its own state container so old + new playbacks have independent flags
2. **`suppressFallback` flipped BEFORE `src = ""`** — by the time the error event fires, the flag is already true → listener silently no-ops
3. **`speechSynthesis.cancel()` on every stop** — cancels any in-flight Daniel utterance from a previous fallback that's still mid-speech
4. **`fallbackSpeak()` guards `state.voiceEnabled`** — even if a stale listener fires after the user disables voice, it won't speak
5. **Set tracker, not single variable** — handles edge cases where `audio.play()` Promise resolves AFTER we thought we cancelled (audio starts playing late)

## Verification

Smoke test in browser console:

```js
// Toggle voice on, observe what fires
const tracker = { audioCreates: 0, ssCancels: 0, ssSpeaks: 0 };
// (monkey-patch Audio + speechSynthesis to count calls)
document.querySelector("#voiceToggle").click();

// after 400ms:
{ audioCreates: 1, ssCancels: 1, ssSpeaks: 0 }
```

Exactly one audio created (the Google female TTS), one cancel call (clearing old state), zero SpeechSynthesis speaks (the male fallback never fires). **No dual playback.**

## Lesson

When an event source (audio element) can be cancelled programmatically, the cancellation itself often triggers the same error event you use for legitimate failure detection. Always flip your "is this an intentional stop?" flag BEFORE the cancellation, never after.

## Related

- [[Features/AI Voice Agent]]
- [[Features/Breaking News Popup]]
