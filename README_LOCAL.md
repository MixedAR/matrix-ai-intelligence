# Matrix AI Intelligence - Local Setup

## Requirements

- Python 3.10 or newer
- Node.js 18 or newer
- npm
- Codex CLI installed locally

Check Codex:

```bash
codex --version
```

## Install

From the project folder:

```bash
npm install
```

## Run

```bash
npm start
```

Then open:

```text
http://127.0.0.1:8000/
```

## Work With Local Codex

Open a terminal in this project folder and run:

```bash
codex
```

Useful files:

- `index.html` - page structure
- `styles.css` - layout and visual design
- `app.js` - globe, markers, camera dock, interaction logic
- `matrix_server.py` - local API server and live feed integrations
- `countries.geojson` - country outlines and labels
- `verify_render.js` - Playwright render check

## Verify

In one terminal, keep the server running:

```bash
npm start
```

In another terminal:

```bash
npm run verify
```

If Playwright browsers are missing:

```bash
npx playwright install
```

## Notes

Live data depends on public upstream APIs. Some sources may rate-limit anonymous requests temporarily; the server uses fallbacks where practical.
