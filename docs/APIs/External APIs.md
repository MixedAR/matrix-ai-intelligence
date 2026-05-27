---
title: External APIs
tags: [apis, reference]
date: 2026-05-26
---

# External APIs

The full inventory of external services this dashboard pulls from. **All free, no signups, no API keys.** Two exceptions noted.

## Geo-tagged event sources (11)

| # | API | URL | Used for |
|---|---|---|---|
| 1 | **USGS Earthquake** | `earthquake.usgs.gov/.../2.5_day.geojson` | M≥2.5 seismic events, 1 day window |
| 2 | **EMSC** | `seismicportal.eu/fdsnws/event/1/query` | European-Mediterranean seismic |
| 3 | **GeoNet NZ** | `api.geonet.org.nz/quake?MMI=3` | New Zealand high-resolution quakes |
| 4 | **GDACS** | `gdacs.org/contentdata/xml/gdacs.geojson` | Global active disasters w/ alert level |
| 5 | **NASA EONET** | `eonet.gsfc.nasa.gov/api/v3/events` | All open natural events, volcanoes, wildfires |
| 6 | **NOAA NHC** | `nhc.noaa.gov/CurrentStorms.json` | Active tropical cyclones |
| 7 | **NOAA SWPC** | `services.swpc.noaa.gov/products/alerts.json` | Space weather alerts |
| 8 | **NOAA NWS** | `api.weather.gov/alerts/active` | Active weather warnings |
| 9 | **Open-Meteo Forecast** | `api.open-meteo.com/v1/forecast` | Current weather, 12 cities |
| 10 | **Open-Meteo Air Quality** | `air-quality-api.open-meteo.com/v1/air-quality` | AQI, PM2.5, ozone — 12 cities |
| 11 | **Open-Meteo Marine** | `marine-api.open-meteo.com/v1/marine` | Wave height, ocean currents — 6 zones |

## Position trackers (2)

| # | API | URL | Used for |
|---|---|---|---|
| 12 | **NOAA CO-OPS** | `api.tidesandcurrents.noaa.gov` | Water levels, 5 US tide stations |
| 13 | **Where the ISS at** | `api.wheretheiss.at/v1/satellites/25544` | ISS live position |

## Aviation (3 — primary + 2 fallbacks)

| # | API | URL | Used for |
|---|---|---|---|
| 14 | **airplanes.live** | `api.airplanes.live/v2/point/{lat}/{lon}/{nm}` | Primary — global ADS-B, 35 regional fan-out |
| 15 | OpenSky | `opensky-network.org/api/states/all` | Fallback (rate-limited) |
| 16 | ADSB.lol | `api.adsb.lol/v2/point/{lat}/{lon}/{nm}` | Last-resort fallback |

## Satellite TLE (2)

| # | API | URL | Used for |
|---|---|---|---|
| 17 | TLE API | `tle.ivanstanojevic.me/api/tle/{id}` | Per-satellite TLE (30 named) |
| 18 | CelesTrak | `celestrak.org/NORAD/elements/gp.php` | Fallback bulk TLE feed |

## News (23 RSS feeds)

| Category | Feeds |
|---|---|
| World | BBC, Reuters, Al Jazeera (removed by user), France24, Guardian, CNN, DW |
| US | NPR News |
| Tech | Wired, Hacker News (HN-RSS) |
| Business | CNBC |
| Defense | Defense News |
| Science | NASA Breaking |
| **AI** | TechCrunch AI, MIT Tech Review, VentureBeat AI, OpenAI News, NVIDIA Blog, The Decoder, Marktechpost, Hugging Face, Synced Review, Apple ML |
| **California** | LA Times California, CalMatters, KCRA Sacramento, KRON4 Bay Area, Berkeleyside (filtered to major breaking only) |

See [[APIs/News Feeds]] for the full URL list.

## YouTube (18 channels — 2 categories)

| Category | Channels |
|---|---|
| **AI** (9) | AI Explained, Lex Fridman, MKBHD, Matt Wolfe, OpenAI, Google AI, AI Daily Brief, Wes Roth, Fireship |
| **POE2** (9) | Palsteron, Moxsy, ExiledAgain, Path of Exile official, Jorgen, Fubgun, P4wnyhof, GhazzyTV, IGN |

Via per-channel Atom RSS at `youtube.com/feeds/videos.xml?channel_id={UC...}`. See [[APIs/YouTube Channels]] for IDs.

## Markets + intel widgets (5)

| # | API | URL | Used for |
|---|---|---|---|
| 19 | **CoinGecko** | `api.coingecko.com/api/v3/coins/markets` | Top 6 cryptos with 24h change |
| 20 | **ExchangeRate-API** | `open.er-api.com/v6/latest/USD` | FX rates EUR/GBP/JPY/CNY/INR/AUD |
| 21 | **Hacker News** | `hacker-news.firebaseio.com/v0/topstories` | Top 6 HN stories |
| 22 | **Wikipedia** | `en.wikipedia.org/api/rest_v1/feed/featured/...` | In-the-news daily picks |
| 23 | **NASA APOD** | `api.nasa.gov/planetary/apod?api_key=DEMO_KEY` | Astronomy picture of the day (uses public DEMO_KEY) |
| 24 | **SpaceX API** | `api.spacexdata.com/v5/launches/next` | Next SpaceX launch |

## TTS (1)

| # | API | URL | Used for |
|---|---|---|---|
| 25 | **Google Translate TTS** | `translate.google.com/translate_tts?...&client=tw-ob` | Unofficial endpoint, en-GB female voice — see [[Features/AI Voice Agent]] |

## Cameras (1)

| # | API | URL | Used for |
|---|---|---|---|
| 26 | **YouTube embeds** | `youtube.com/embed/{ID}?autoplay=1&mute=1` | 5 Bay Area live feeds — see [[Features/Live Cameras]] |

---

**Total unique providers**: 26 (a few overlap — Open-Meteo provides 3 endpoints, NOAA provides 4).

## Notes on free use

- All 25+ APIs accept anonymous traffic with no auth
- **NASA APOD uses `DEMO_KEY`** — works for low-traffic, can be replaced with a free user key if needed
- **Google Translate TTS** is unofficial — has worked reliably for years but not formally licensed
- **YouTube channel RSS** is public/official — fully supported by YouTube

## Related

- [[APIs/Internal Endpoints]]
- [[APIs/News Feeds]]
- [[APIs/YouTube Channels]]
- [[Architecture/Backend Server]]
