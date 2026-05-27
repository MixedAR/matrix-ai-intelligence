---
title: Welcome Modal
tags: [feature, modal, intro, audio]
date: 2026-05-26
---

# Welcome Modal

Centered modal that shows on first visit per browser session. OK button click both dismisses the modal AND triggers the intro music (one user gesture satisfies both browser autoplay policy and the dismissal).

## Visual

```
                    ●
                  ◉ ⌖ ◉         ← brand mark (concentric circles + crosshairs gradient)
                    ●

       ● MATRIX // INTEL CONSOLE   ← cyan eyebrow with pulsing LED

       Welcome to MATRIX AI       ← gradient title (blue → pink)
       Intelligence Server

       Real-time global awareness across 25+
       open intelligence sources — seismic, aviation,
       satellites, breaking news, AI & POE2 video,
       live cameras, and a voice agent.

       ▸ 180+ aircraft tracked across 35 regions worldwide
       ▸ Live Bay Area camera feeds
       ▸ Breaking news from 17 sources with AI voice agent

       ┌──────────────────────────┐
       │   OK · ENGAGE CONSOLE    │  ← gradient button, autofocused
       └──────────────────────────┘
```

## Style

- Centered with `position: fixed; inset: 0; display: grid; place-items: center`
- Backdrop: radial gradient at 20%/80% with `backdrop-filter: blur(14px)`
- Modal width: `min(560px, calc(100vw - 32px))`
- Corner ticks (cyan top-left, magenta bottom-right) match the panel aesthetic
- Slide-in animation: `transform: scale(0.96) translateY(8px) → 1 0`, 320ms cubic-bezier

## Logic

```js
const INTRO_PLAYED_KEY = "matrix.introPlayed";
const INTRO_TRACK_URL = "/assets/intro.mp3";

function showWelcomeModal() {
  if (sessionStorage.getItem(INTRO_PLAYED_KEY) === "1") return;
  const backdrop = document.querySelector("#welcomeBackdrop");
  const okBtn = document.querySelector("#welcomeOk");
  backdrop.classList.remove("hidden");
  requestAnimationFrame(() => backdrop.classList.add("visible"));

  const dismiss = () => {
    playIntroTrack();
    backdrop.classList.remove("visible");
    setTimeout(() => backdrop.classList.add("hidden"), 320);
  };
  const onKey = (e) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
      e.preventDefault();
      dismiss();
    }
  };
  okBtn.addEventListener("click", dismiss);
  document.addEventListener("keydown", onKey);
  setTimeout(() => okBtn.focus(), 100);
}

showWelcomeModal();
```

## Intro music

Plays the user-supplied MP3 served at `/assets/intro.mp3` (244 KB).

```js
function playIntroTrack() {
  if (introAudio) return;
  introAudio = new Audio(INTRO_TRACK_URL);
  introAudio.volume = 0.75;
  introAudio.addEventListener("ended", () => { introAudio = null; });
  introAudio.play().catch(() => {});
  sessionStorage.setItem(INTRO_PLAYED_KEY, "1");
}
```

The OK click is the gesture that satisfies browser autoplay policy — `audio.play()` resolves cleanly.

## Once per session

`sessionStorage` (not `localStorage`) so:
- Same tab, navigate / refresh → no modal (already played this session)
- Close tab, open new tab → modal shows again
- Close browser entirely, reopen → modal shows again

This matches typical operator behavior — they don't want the modal every page load, but a fresh session deserves the welcome.

## Keyboard friendly

- **OK button autofocused** when modal opens
- **Enter / Space** dismiss (same as clicking OK)
- **Esc** dismisses

## What replaces the modal on subsequent loads

After dismissal, the regular `loadEvents()` boot continues normally. The dashboard is already loading data in the background while the modal is up, so the moment you click OK, the globe and panels are populated almost instantly.

## Related

- [[Features/Alert Sounds]]
- [[Architecture/Data Flow]]
