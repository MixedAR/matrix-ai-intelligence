---
title: Alert Sounds
tags: [feature, audio, webaudio]
date: 2026-05-26
---

# Alert Sounds

Each event type plays a distinct sonic signature when it auto-announces or pops up. **Sound ON by default.** Operator can recognize signal type by ear without looking.

## 12 distinct sounds

| Layer / event | Signature |
|---|---|
| **breaking-news** | Urgent triple-beep: square 980 Hz → 1320 Hz → sine 1760→880 sweep |
| **video** | Soft rising arpeggio: triangle 660 → 880 → 1175 Hz |
| **weather** | Sawtooth sweep 540↔820 Hz (siren-ish) |
| **earthquake** | Deep sine 130→70 Hz + filtered low-noise rumble |
| **disaster** | Klaxon-style: 3× square 700↔900 Hz |
| **space-weather** | Spacey shimmer: sine 1400→2200 Hz + detuned triangle layer |
| **aircraft** | Quick radar ping: sine 2400→1200 Hz |
| **satellite** | Two-tone blip: sine 1800↔2400 Hz |
| **camera** | Noise burst + 600 Hz click |
| **natural** (fire/volcano) | Low rumble noise + sawtooth 220→130 Hz |
| **air-quality** | Gentle 520→780 Hz triangle two-step |
| **ocean** | Slow sine 180→230 Hz wave |
| **default** | Sine 720→480 Hz |

## Synthesizer

Pure Web Audio API. Two primitives:

### `playTone(opts)`

Single oscillator with envelope:
```js
function playTone({ type, startFreq, endFreq, duration, attack, release, volume, startTime, detune }) {
  const ctx = ensureAudio();
  const now = ctx.currentTime + startTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 4500;
  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, now);
  if (endFreq !== startFreq) {
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
  }
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(now); osc.stop(now + duration + release);
}
```

### `playNoiseBurst(opts)`

Filtered white noise for textures (camera shutters, earthquake rumbles):
```js
function playNoiseBurst({ duration, volume, lowpass }) {
  const ctx = ensureAudio();
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = lowpass;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(ctx.currentTime); src.stop(ctx.currentTime + duration);
}
```

### Composition

The 12 sounds are composed by calling `playTone` (sometimes `playNoiseBurst`) one or more times with calculated `startTime` offsets. Example for `breaking-news`:

```js
"breaking-news": () => {
  playTone({ type: "square", startFreq: 980, endFreq: 980, duration: 0.08, volume: 0.10, startTime: 0 });
  playTone({ type: "square", startFreq: 1320, endFreq: 1320, duration: 0.08, volume: 0.10, startTime: 0.12 });
  playTone({ type: "sine",   startFreq: 1760, endFreq: 880,  duration: 0.22, volume: 0.10, startTime: 0.28 });
}
```

## Dispatcher

```js
const ALERT_SOUNDS = { /* the 12 keyed functions */ };

function playAlertSound(kindOrSeverity = "default") {
  const fn = ALERT_SOUNDS[kindOrSeverity] || ALERT_SOUNDS.default;
  try { fn(); } catch (_) {}
}
```

Call sites:
- `announceEvent(event)` → `playAlertSound(event.layer)` — autopops use the layer key
- `showNextBreakingPopup(item)` → `playAlertSound("breaking-news")` — fixed key
- `pollYouTubeVideos()` → `playAlertSound("video")` when new clips arrive

## Sound ON by default

```js
state.soundEnabled = true;
```

But browsers won't let audio play before a user gesture. `attachAudioUnlock()` listens for the first `pointerdown` or `keydown` ANYWHERE on the page and calls `audio.resume()` silently. Sound button starts in green "Sound On" state — first interaction unlocks audio for real.

Clicking the Sound button toggles the flag without affecting the AudioContext.

## Volume

Each sound has its own `volume` parameter (0.05–0.16). The breaking-news triple-beep is loudest, ambient sounds (camera, air-quality) are quietest. All sounds go through the master AudioContext destination — no master volume control yet.

## Related

- [[Features/AI Voice Agent]]
- [[Features/Breaking News Popup]]
