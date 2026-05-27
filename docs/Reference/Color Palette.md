---
title: Color Palette
tags: [reference, design]
date: 2026-05-26
---

# Color Palette

Defined as CSS custom properties on `:root` in `styles.css`.

## Surfaces

| Var | Hex | Use |
|---|---|---|
| `--bg` | `#04070d` | Page background base |
| `--bg-2` | `#060a14` | Secondary background |
| `--panel` | `rgba(9, 14, 24, 0.86)` | Panel background (translucent + blur) |
| `--panel-solid` | `#080d18` | Solid panel for modals etc. |

## Lines

| Var | Hex | Use |
|---|---|---|
| `--line` | `rgba(120, 162, 220, 0.16)` | Default border / divider |
| `--line-soft` | `rgba(120, 162, 220, 0.08)` | Subtle dividers within panels |
| `--line-strong` | `rgba(255, 79, 142, 0.36)` | Highlighted / emphasis borders |
| `--line-cyber` | `rgba(67, 232, 216, 0.34)` | Cyan accent border |

## Ink (text)

| Var | Hex | Use |
|---|---|---|
| `--ink` | `#eef2ff` | Primary text |
| `--ink-dim` | `#c8d2e8` | Dim secondary text |
| `--muted` | `#8595b6` | Muted labels / metadata |
| `--muted-dim` | `#5e6c89` | Very muted (small caps, eyebrows) |

## Accents

| Var | Hex | Use |
|---|---|---|
| `--accent` | `#48a6ff` | Primary blue accent |
| `--accent-2` | `#ff4fa3` | Magenta — breaking news, alerts, danger highlights |
| `--cyber` | `#43e8d8` | Cyan — system OK, live status, intel widgets |
| `--warning` | `#ff9f1c` | Orange — moderate severity, HN ticker |
| `--danger` | `#ff3d4f` | Red — high severity, errors |
| `--good` | `#4df2c8` | Green — success, system OK |
| `--hot` | `#ff5a1f` | Hot orange — extreme events |
| `--gold` | `#f8c35b` | Gold — California news, business |

## Effects

| Var | Use |
|---|---|
| `--shadow` | `0 24px 70px rgba(0, 0, 0, 0.55)` — heavy drop shadow for panels |
| `--shadow-2` | `0 8px 28px rgba(0, 0, 0, 0.38)` — lighter card shadow |

## Typography

| Var | Stack | Use |
|---|---|---|
| `--mono` | JetBrains Mono, SF Mono, ui-monospace, Menlo, Consolas | All numeric/telemetry text |
| (default sans) | Inter, ui-sans-serif, system-ui, ... | All UI text |

## Layer marker colors

Each globe layer has its own hex (used for icon fill + tooltip dot):

| Layer | Color |
|---|---|
| earthquake | `#ff3d4f` |
| disaster | `#ff9f1c` |
| natural | `#ff4fa3` |
| space-weather | `#b56cff` |
| weather | `#48a6ff` |
| aircraft | `#f6f8ff` |
| satellite | `#ff7a1a` |
| camera | `#43e8d8` |
| air-quality | `#ff4fa3` |
| ocean | `#48a6ff` |

## Background page

```css
body {
  background:
    radial-gradient(circle at 14% 14%, rgba(72, 166, 255, 0.18), transparent 32%),
    radial-gradient(circle at 86% 12%, rgba(255, 79, 163, 0.13), transparent 30%),
    radial-gradient(circle at 82% 88%, rgba(67, 232, 216, 0.10), transparent 36%),
    linear-gradient(145deg, #04060e 0%, #070b17 48%, #03050a 100%);
}
```

Three radial color washes (blue top-left, magenta top-right, cyan bottom-right) over a dark diagonal gradient. Reads as "intel operator station" — never neutral, always tinted.

## Panel corner ticks

Every `.panel` gets a cyan top-left + magenta bottom-right corner notch via pseudo-elements:

```css
.panel::before {
  content: "";
  position: absolute;
  top: -1px; left: -1px;
  width: 14px; height: 14px;
  border-top: 1px solid var(--cyber);
  border-left: 1px solid var(--cyber);
}

.panel::after {
  content: "";
  position: absolute;
  bottom: -1px; right: -1px;
  width: 14px; height: 14px;
  border-bottom: 1px solid var(--accent-2);
  border-right: 1px solid var(--accent-2);
}
```

This single design detail is what makes the whole dashboard feel "Palantir-style" — every container is framed by these subtle corner ticks.

## Related

- [[Architecture/Frontend Layout]]
