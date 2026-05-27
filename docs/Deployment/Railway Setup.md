---
title: Railway Setup
tags: [deployment, railway, infra]
date: 2026-05-26
---

# Railway Setup

The dashboard is hosted on **Railway** (railway.app). Why Railway over Vercel / Hostinger:

| Constraint | Why it ruled out Vercel | Why Railway works |
|---|---|---|
| `/api/events` cold load = 16-30s | Serverless 10s (Hobby) / 60s (Pro) hard timeout | Long-running process, no timeout |
| In-memory caches across requests | Stateless functions can't share state | Single process keeps caches warm |
| `subprocess.run(["curl", ...])` | Vercel Python sandbox has no `curl` | Nixpacks installs curl as a system pkg |
| Parallel ThreadPool fan-out to 35 endpoints | Multiple invocations needed | Done in one process |

## Production URL

**https://web-production-3c10e.up.railway.app**

## Deploy artifacts in the repo

| File | Content | Purpose |
|---|---|---|
| `Procfile` | `web: python3 matrix_server.py` | Heroku-style start command |
| `railway.json` | health-check path `/api/cameras`, restart-on-failure policy | Railway-specific deploy options |
| `nixpacks.toml` | `nixPkgs = ["python312", "curl"]` | Tells Nixpacks builder to install Python 3.12 + curl |
| `requirements.txt` | Empty stub | Disambiguates as Python project for builder detection |

## Build process

When you push to `main`:

1. Railway clones the repo via GitHub
2. Nixpacks detects Python + reads `nixpacks.toml`
3. Installs Python 3.12 + curl from Nixpkgs
4. (Skips `pip install` — `requirements.txt` is empty)
5. Reads `Procfile` for start command
6. Runs `python3 matrix_server.py`
7. Server binds to `$PORT` (Railway injects this env var; our server reads `os.environ.get("PORT", "8000")`)

Total build time: ~60-90 seconds.

## Domain assignment

After first successful deploy:

1. Railway dashboard → service → **Settings** → **Networking**
2. Click **Generate Domain**
3. Railway provisions `*.up.railway.app` subdomain + HTTPS via Let's Encrypt
4. Instantly live

## Custom domain (optional)

To attach `matrix.yourdomain.com`:

1. Settings → Networking → **Custom Domain** → enter the domain
2. Railway shows you a CNAME target
3. Add the CNAME at your registrar (Namecheap, Cloudflare, Hostinger DNS, etc.)
4. HTTPS auto-provisions within 2-3 minutes

## Auto-redeploy on push

Connected GitHub repo means every `git push origin main` triggers an automatic redeploy. No CI/CD config needed.

Workflow:
```bash
# Edit locally
vim app.js
# Commit + push
git add . && git commit -m "tweak news ticker" && git push
# Wait ~60 seconds, Railway redeploys automatically
```

## Environment variables

| Variable | Set by Railway | Used by |
|---|---|---|
| `PORT` | yes (injected) | `matrix_server.py` reads via `os.environ` |
| `RAILWAY_ENVIRONMENT` | yes | not used by us, but available |

Don't need any secrets — every external API we use is anonymous.

## Free tier

Railway Hobby tier:
- $5/month usage credit free
- Includes 500 hours of execution + 1 GB egress
- This dashboard uses pennies — easily fits

## Logs

Railway dashboard → service → Deployments → click latest deploy → live log stream. Useful for debugging upstream API failures.

## Health check

`railway.json` configures health check:
```json
{
  "deploy": {
    "healthcheckPath": "/api/cameras",
    "healthcheckTimeout": 30
  }
}
```

`/api/cameras` is the fastest endpoint (returns static camera list), so health checks complete in ~5ms.

## Related

- [[Deployment/GitHub SSH Auth]]
- [[Architecture/System Overview]]
- [[Reference/Session Log 2026-05-26]]
