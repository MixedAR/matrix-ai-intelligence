#!/usr/bin/env python3
from __future__ import annotations

import json
import base64
import hashlib
import math
import os
import random
import shutil
import time
import re
import subprocess
import html
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

PORT = int(os.environ.get("PORT", "8000"))
CACHE_TTL_SECONDS = 55
NEWS_CACHE_TTL_SECONDS = 45
INTEL_CACHE_TTL_SECONDS = 90
USER_AGENT = "MatrixAIIntelligence/1.0 (+local situational awareness dashboard)"
AIRCRAFT_LIMIT = 180

cache: dict[str, Any] = {"at": 0.0, "payload": None}
satellite_cache: dict[str, Any] = {"at": 0.0, "payload": None}
news_cache: dict[str, Any] = {"at": 0.0, "payload": None}
intel_cache: dict[str, Any] = {"at": 0.0, "payload": None}
videos_ai_cache: dict[str, Any] = {"at": 0.0, "payload": None}
videos_gaming_cache: dict[str, Any] = {"at": 0.0, "payload": None}
youtube_channel_id_cache: dict[str, str] = {}
stock_cache: dict[str, Any] = {"at": 0.0, "payload": None}
social_cache: dict[str, Any] = {"at": 0.0, "payload": None}
aipulse_cache: dict[str, Any] = {"at": 0.0, "payload": None}
VIDEOS_CACHE_TTL_SECONDS = 90  # keep AI video watch feeling live without hammering YouTube RSS
STOCK_CACHE_TTL_SECONDS = 60
SOCIAL_CACHE_TTL_SECONDS = 120
AIPULSE_CACHE_TTL_SECONDS = 600
ELEVENLABS_DEFAULT_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")  # George - UK male
ELEVENLABS_MODEL_ID = os.environ.get("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2")
ELEVENLABS_LOCAL_KEY_PATH = os.environ.get(
    "ELEVENLABS_API_KEY_FILE",
    "/Users/stevecaudle/Obsidian/Steve-main/ElevenLabs API/Elevenlabs API.md",
)
GEMINI_STT_MODEL = os.environ.get("GEMINI_STT_MODEL", "gemini-3.5-flash")
GEMINI_LOCAL_KEY_PATH = os.environ.get(
    "GEMINI_API_KEY_FILE",
    "/Users/stevecaudle/Obsidian/Steve-main/google AI studio/google AI studio API.md",
)
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
DEEPSEEK_LOCAL_KEY_PATH = os.environ.get(
    "DEEPSEEK_API_KEY_FILE",
    "/Users/stevecaudle/Obsidian/Steve-main/DeepSeek/Deepseek API.md",
)
OPENAI_TTS_MODEL = os.environ.get("OPENAI_TTS_MODEL", "gpt-4o-mini-tts")
OPENAI_TTS_VOICE = os.environ.get("OPENAI_TTS_VOICE", "onyx")
OPENAI_LOCAL_KEY_PATH = os.environ.get("OPENAI_API_KEY_FILE", "")
SATELLITE_IDS = [
    25544, 20580, 25338, 28654, 33591, 25994, 27424, 37849, 43013, 54234,
    39084, 49260, 40697, 42063, 39634, 38771, 43689, 36516, 41866, 41867,
    40115, 40730, 43567, 43820, 44013, 44878, 48274, 48275, 48276, 48277,
]
WEATHER_LOCATIONS = [
    ("New York", 40.7128, -74.0060),
    ("London", 51.5074, -0.1278),
    ("Tokyo", 35.6762, 139.6503),
    ("Singapore", 1.3521, 103.8198),
    ("Sydney", -33.8688, 151.2093),
    ("Dubai", 25.2048, 55.2708),
    ("Sao Paulo", -23.5558, -46.6396),
    ("Johannesburg", -26.2041, 28.0473),
    ("Los Angeles", 34.0522, -118.2437),
    ("Mexico City", 19.4326, -99.1332),
    ("Anchorage", 61.2181, -149.9003),
    ("Honolulu", 21.3099, -157.8581),
]
OCEAN_STATIONS = [
    ("New York Harbor", "8518750", 40.7006, -74.0142),
    ("San Francisco Bay", "9414290", 37.8063, -122.4659),
    ("Seattle", "9447130", 47.6026, -122.3393),
    ("Honolulu", "1612340", 21.3067, -157.867),
    ("Key West", "8724580", 24.5551, -81.8079),
]
MARINE_LOCATIONS = [
    ("North Atlantic", 40.0, -50.0),
    ("North Pacific", 35.0, -145.0),
    ("Gulf of Mexico", 26.0, -90.0),
    ("Mediterranean Sea", 36.0, 18.0),
    ("Tasman Sea", -35.0, 160.0),
    ("Indian Ocean", -20.0, 80.0),
]
CAMERAS = [
    {
        "id": "sf-downtown-abc7",
        "title": "San Francisco Downtown Live",
        "source": "ABC7 News Bay Area",
        "lat": 37.7749,
        "lon": -122.4194,
        "liveUrl": "https://www.youtube.com/watch?v=G8RIAgPxaMc",
        "embedUrl": "https://www.youtube.com/embed/G8RIAgPxaMc?autoplay=1&mute=1&playsinline=1&controls=0&rel=0",
        "thumbnailUrl": "https://i.ytimg.com/vi/G8RIAgPxaMc/hqdefault_live.jpg",
        "url": "https://www.youtube.com/watch?v=G8RIAgPxaMc",
        "summary": "ABC7 News 24/7 live camera over downtown San Francisco.",
    },
    {
        "id": "sf-bay-bridge-abc7",
        "title": "SF-Oakland Bay Bridge Live",
        "source": "ABC7 News Bay Area",
        "lat": 37.7983,
        "lon": -122.3778,
        "liveUrl": "https://www.youtube.com/watch?v=CXYr04BWvmc",
        "embedUrl": "https://www.youtube.com/embed/CXYr04BWvmc?autoplay=1&mute=1&playsinline=1&controls=0&rel=0",
        "thumbnailUrl": "https://i.ytimg.com/vi/CXYr04BWvmc/hqdefault_live.jpg",
        "url": "https://www.youtube.com/watch?v=CXYr04BWvmc",
        "summary": "ABC7 News 24/7 live camera on the San Francisco-Oakland Bay Bridge.",
    },
    {
        "id": "sf-golden-gate-mersea",
        "title": "Golden Gate / SF Skyline Live",
        "source": "Teleport.camera",
        "lat": 37.8266,
        "lon": -122.3680,
        "liveUrl": "https://www.youtube.com/watch?v=BSWhGNXxT9A",
        "embedUrl": "https://www.youtube.com/embed/BSWhGNXxT9A?autoplay=1&mute=1&playsinline=1&controls=0&rel=0",
        "thumbnailUrl": "https://i.ytimg.com/vi/BSWhGNXxT9A/hqdefault_live.jpg",
        "url": "https://www.youtube.com/watch?v=BSWhGNXxT9A",
        "summary": "Live waterfront view of the San Francisco skyline and Golden Gate Bridge from Treasure Island.",
    },
    {
        "id": "sf-pier-39",
        "title": "Pier 39 / Fisherman's Wharf Live",
        "source": "California Live Cams",
        "lat": 37.8087,
        "lon": -122.4098,
        "liveUrl": "https://www.youtube.com/watch?v=0_AkYnrHWik",
        "embedUrl": "https://www.youtube.com/embed/0_AkYnrHWik?autoplay=1&mute=1&playsinline=1&controls=0&rel=0",
        "thumbnailUrl": "https://i.ytimg.com/vi/0_AkYnrHWik/hqdefault_live.jpg",
        "url": "https://www.youtube.com/watch?v=0_AkYnrHWik",
        "summary": "Live camera at Pier 39 on the San Francisco waterfront.",
    },
    {
        "id": "us-101-morgan-hill",
        "title": "US-101 / Santa Clara Valley Live",
        "source": "PTZtv",
        "lat": 37.1305,
        "lon": -121.6544,
        "liveUrl": "https://www.youtube.com/watch?v=Ul6wlBwXz9Y",
        "embedUrl": "https://www.youtube.com/embed/Ul6wlBwXz9Y?autoplay=1&mute=1&playsinline=1&controls=0&rel=0",
        "thumbnailUrl": "https://i.ytimg.com/vi/Ul6wlBwXz9Y/hqdefault_live.jpg",
        "url": "https://www.youtube.com/watch?v=Ul6wlBwXz9Y",
        "summary": "Live view of US Highway 101 corridor in the South Bay's Santa Clara Valley with traffic and weather.",
    },
    {
        "id": "wsdot-s178-still",
        "title": "I-5 at S 178th Street",
        "source": "WSDOT",
        "lat": 47.443717,
        "lon": -122.268278,
        "imageUrl": "https://images.wsdot.wa.gov/nw/005vc15315.jpg",
        "url": "https://wsdot.com/travel/real-time/cameras",
        "summary": "Official Washington State DOT updating traffic camera still.",
    },
    {
        "id": "wsdot-sr16-mp850-still",
        "title": "SR 16 at MP 8.50",
        "source": "WSDOT",
        "lat": 47.268,
        "lon": -122.557,
        "imageUrl": "https://images.wsdot.wa.gov/orflow/016vc00850.jpg",
        "url": "https://wsdot.com/travel/real-time/cameras",
        "summary": "Official Washington State DOT updating traffic camera still.",
    },
]


def fetch_json(url: str, timeout: int = 8) -> Any:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8", errors="replace"))


def fetch_text(url: str, timeout: int = 8) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
            "Accept": "application/rss+xml, application/xml, text/xml, */*",
            "Accept-Language": "en-US,en;q=0.8",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError:
        result = subprocess.run(
            ["curl", "-fsSL", "-A", "Mozilla/5.0", url],
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return result.stdout


def iso_from_ms(value: Any) -> str:
    try:
      timestamp = float(value) / 1000
    except (TypeError, ValueError):
      return datetime.now(timezone.utc).isoformat()
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat()


def severity_from_magnitude(magnitude: float | None) -> str:
    if magnitude is None:
        return "medium"
    if magnitude >= 5:
        return "high"
    if magnitude >= 3:
        return "medium"
    return "low"


def severity_from_alert(value: str | None) -> str:
    normalized = (value or "").lower()
    if normalized in {"red", "orange"}:
        return "high"
    if normalized in {"green", "blue"}:
        return "low"
    return "medium"


def add_event(events: list[dict[str, Any]], event: dict[str, Any]) -> None:
    lat = event.get("lat")
    lon = event.get("lon")
    if lat is None or lon is None:
        return
    try:
        lat_f = float(lat)
        lon_f = float(lon)
    except (TypeError, ValueError):
        return
    if not math.isfinite(lat_f) or not math.isfinite(lon_f):
        return
    if not (-90 <= lat_f <= 90 and -180 <= lon_f <= 180):
        return
    event["lat"] = lat_f
    event["lon"] = lon_f
    events.append(event)


def coordinate_pairs(value: Any) -> list[tuple[float, float]]:
    pairs: list[tuple[float, float]] = []
    if isinstance(value, list):
        if len(value) >= 2 and all(isinstance(v, (int, float)) for v in value[:2]):
            pairs.append((float(value[0]), float(value[1])))
        else:
            for item in value:
                pairs.extend(coordinate_pairs(item))
    return pairs


def geometry_center(geometry: dict[str, Any]) -> tuple[float, float] | None:
    pairs = coordinate_pairs(geometry.get("coordinates"))
    if not pairs:
        return None
    lon = sum(pair[0] for pair in pairs) / len(pairs)
    lat = sum(pair[1] for pair in pairs) / len(pairs)
    return lat, lon


def load_usgs(events: list[dict[str, Any]], sources: list[str]) -> None:
    # M2.5+ daily feed gives us the same upstream-filtered list the USGS uses for "felt" events
    data = fetch_json("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson")
    sources.append("USGS Earthquake")
    for feature in data.get("features", [])[:120]:
        props = feature.get("properties", {})
        coords = feature.get("geometry", {}).get("coordinates", [])
        if len(coords) < 2:
            continue
        magnitude = props.get("mag")
        if magnitude is None or magnitude < 2.5:
            continue
        title = props.get("title") or "USGS seismic event"
        add_event(events, {
            "id": f"usgs-{feature.get('id')}",
            "layer": "earthquake",
            "source": "USGS Earthquake",
            "title": title,
            "summary": f"Magnitude {magnitude if magnitude is not None else 'unknown'} seismic activity reported by USGS.",
            "severity": severity_from_magnitude(magnitude),
            "time": iso_from_ms(props.get("time")),
            "lat": coords[1],
            "lon": coords[0],
            "url": props.get("url"),
            "details": {
                "Magnitude": magnitude,
                "Depth": f"{coords[2]} km" if len(coords) > 2 else "n/a",
                "Place": props.get("place"),
                "Status": props.get("status"),
                "Tsunami": "Yes" if props.get("tsunami") else "No",
            },
        })


def load_gdacs(events: list[dict[str, Any]], sources: list[str]) -> None:
    data = fetch_json("https://www.gdacs.org/contentdata/xml/gdacs.geojson", timeout=10)
    sources.append("GDACS")
    for feature in data.get("features", [])[:80]:
        props = feature.get("properties", {})
        coords = feature.get("geometry", {}).get("coordinates", [])
        if not coords:
            continue
        if isinstance(coords[0], list):
            coords = coords[0]
        if len(coords) < 2:
            continue
        event_type = props.get("eventtype") or props.get("eventtype_name") or "Disaster"
        alert = props.get("alertlevel") or props.get("alert")
        title = props.get("name") or props.get("eventname") or f"GDACS {event_type} alert"
        add_event(events, {
            "id": f"gdacs-{props.get('eventid') or props.get('episodeid') or title}",
            "layer": "disaster",
            "source": "GDACS",
            "title": title,
            "summary": f"{event_type} alert level {alert or 'n/a'} reported by GDACS.",
            "severity": severity_from_alert(alert),
            "time": props.get("fromdate") or props.get("datemodified") or datetime.now(timezone.utc).isoformat(),
            "lat": coords[1],
            "lon": coords[0],
            "url": props.get("url", {}).get("report") if isinstance(props.get("url"), dict) else props.get("url"),
            "details": {
                "Event type": event_type,
                "Alert level": alert or "n/a",
                "Country": props.get("country") or props.get("countries") or "n/a",
                "Episode": props.get("episodeid") or "n/a",
            },
        })


def load_eonet(events: list[dict[str, Any]], sources: list[str]) -> None:
    data = fetch_json("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=80")
    sources.append("NASA EONET")
    for item in data.get("events", []):
        geometry = item.get("geometry") or []
        if not geometry:
            continue
        geo = geometry[-1]
        coords = geo.get("coordinates", [])
        if isinstance(coords, list) and coords and isinstance(coords[0], list):
            coords = coords[0]
        if len(coords) < 2:
            continue
        categories = ", ".join(cat.get("title", "Natural Event") for cat in item.get("categories", []))
        add_event(events, {
            "id": f"eonet-{item.get('id')}",
            "layer": "natural",
            "source": "NASA EONET",
            "title": item.get("title") or "NASA natural event",
            "summary": f"Open natural event tracked by NASA EONET. Category: {categories or 'Unclassified'}.",
            "severity": "medium",
            "time": geo.get("date") or datetime.now(timezone.utc).isoformat(),
            "lat": coords[1],
            "lon": coords[0],
            "url": item.get("link"),
            "details": {
                "Category": categories or "Unclassified",
                "EONET ID": item.get("id"),
                "Status": item.get("closed") or "Open",
            },
        })


def load_space_weather(events: list[dict[str, Any]], sources: list[str]) -> None:
    try:
        data = fetch_json("https://services.swpc.noaa.gov/products/alerts.json")
    except Exception:
        return
    sources.append("NOAA SWPC")
    # Space weather is global; plot at the NOAA SWPC operations center as source provenance.
    rows = data[:10] if isinstance(data, list) else []
    for row in rows:
        if isinstance(row, dict):
            issued = row.get("issue_datetime") or datetime.now(timezone.utc).isoformat()
            message = row.get("message") or "Space weather alert"
            product_id = row.get("product_id") or "swpc"
        elif isinstance(row, list):
            issued = row[0] if len(row) > 0 else datetime.now(timezone.utc).isoformat()
            message = row[3] if len(row) > 3 else "Space weather alert"
            product_id = row[1] if len(row) > 1 else "swpc"
        else:
            continue
        first_line = str(message).replace("\r", "\n").split("\n")[0][:160]
        add_event(events, {
            "id": f"swpc-{issued}-{product_id}",
            "layer": "space-weather",
            "source": "NOAA SWPC",
            "title": "Space weather alert",
            "summary": first_line or "NOAA space weather alert.",
            "severity": "medium",
            "time": issued,
            "lat": 39.74,
            "lon": -105.18,
            "url": "https://www.spaceweather.gov/",
            "details": {
                "Product": product_id,
                "Issued": issued,
                "Agency": "NOAA SWPC",
            },
        })


def load_weather_alerts(events: list[dict[str, Any]], sources: list[str]) -> None:
    data = fetch_json("https://api.weather.gov/alerts/active?status=actual&message_type=alert", timeout=10)
    sources.append("NOAA/NWS Alerts")
    for feature in data.get("features", [])[:80]:
        props = feature.get("properties", {})
        geometry = feature.get("geometry") or {}
        center = geometry_center(geometry)
        if not center:
            continue
        severity = (props.get("severity") or "").lower()
        if severity in {"extreme", "severe"}:
            level = "high"
        elif severity in {"moderate"}:
            level = "medium"
        else:
            level = "low"
        event = props.get("event") or "Weather alert"
        area = props.get("areaDesc") or "Affected area"
        add_event(events, {
            "id": f"nws-{props.get('id') or event}-{area[:40]}",
            "layer": "weather",
            "source": "NOAA/NWS Alerts",
            "title": event,
            "summary": f"{event} for {area}.",
            "severity": level,
            "time": props.get("sent") or props.get("effective") or datetime.now(timezone.utc).isoformat(),
            "lat": center[0],
            "lon": center[1],
            "url": props.get("uri") or props.get("web"),
            "details": {
                "Severity": props.get("severity"),
                "Urgency": props.get("urgency"),
                "Certainty": props.get("certainty"),
                "Area": area,
                "Expires": props.get("expires"),
            },
        })


def load_aircraft(events: list[dict[str, Any]], sources: list[str]) -> None:
    # airplanes.live is now the primary feed: sub-second responses worldwide
    # and true global coverage. ADSB.lol is the fallback only.
    if _load_airplanes_live(events, sources):
        return
    # If airplanes.live failed entirely (network glitch), try OpenSky briefly
    data = None
    try:
        data = fetch_json("https://opensky-network.org/api/states/all", timeout=6)
    except Exception:
        data = None
    if not data or not (data.get("states") or []):
        load_adsb_lol_aircraft(events, sources)
        return
    states = data.get("states") or []
    sources.append("OpenSky Network")
    count = 0
    for row in states:
        if not isinstance(row, list) or len(row) < 17:
            continue
        lon, lat = row[5], row[6]
        if lat is None or lon is None:
            continue
        callsign = (row[1] or "Unknown flight").strip() or "Unknown flight"
        origin = row[2] or "Unknown origin"
        altitude = row[13] if row[13] is not None else row[7]
        speed = row[9]
        status = "on ground" if row[8] else "airborne"
        add_event(events, {
            "id": f"aircraft-{row[0]}",
            "layer": "aircraft",
            "source": "OpenSky Network",
            "title": f"{callsign} aircraft track",
            "summary": f"{origin} aircraft {status}. Altitude {round(altitude) if altitude else 'n/a'} m, speed {round(speed) if speed else 'n/a'} m/s.",
            "severity": "low",
            "time": datetime.fromtimestamp(data.get("time") or time.time(), timezone.utc).isoformat(),
            "lat": lat,
            "lon": lon,
            "url": "https://opensky-network.org/",
            "details": {
                "Callsign": callsign,
                "Origin country": origin,
                "Altitude": f"{round(altitude)} m" if altitude else "n/a",
                "Speed": f"{round(speed)} m/s" if speed else "n/a",
                "Heading": f"{round(row[10])} deg" if row[10] is not None else "n/a",
                "Vertical rate": f"{row[11]} m/s" if row[11] is not None else "n/a",
                "ICAO24": row[0],
                "On ground": "Yes" if row[8] else "No",
            },
        })
        count += 1
        if count >= AIRCRAFT_LIMIT:
            break


def _load_airplanes_live(events: list[dict[str, Any]], sources: list[str]) -> bool:
    """Primary live-aircraft loader using airplanes.live community ADS-B feed.
    Returns True on success (added any aircraft), False to allow fallback."""
    points = [
        # ---- North America ----
        ("Boston", 42.3601, -71.0589, 150),
        ("New York", 40.7128, -74.0060, 150),
        ("Philadelphia", 39.9526, -75.1652, 150),
        ("Washington DC", 38.9072, -77.0369, 150),
        ("Charlotte", 35.2271, -80.8431, 150),
        ("Atlanta", 33.7490, -84.3880, 150),
        ("Miami", 25.7617, -80.1918, 150),
        ("Tampa", 27.9506, -82.4572, 150),
        ("New Orleans", 29.9511, -90.0715, 150),
        ("Houston", 29.7604, -95.3698, 150),
        ("Dallas", 32.7767, -96.7970, 150),
        ("Kansas City", 39.0997, -94.5786, 150),
        ("Chicago", 41.8781, -87.6298, 150),
        ("Detroit", 42.3314, -83.0458, 150),
        ("Minneapolis", 44.9778, -93.2650, 150),
        ("Denver", 39.7392, -104.9903, 150),
        ("Salt Lake City", 40.7608, -111.8910, 150),
        ("Phoenix", 33.4484, -112.0740, 150),
        ("Las Vegas", 36.1699, -115.1398, 150),
        ("San Francisco", 37.7749, -122.4194, 150),
        ("Los Angeles", 34.0522, -118.2437, 150),
        ("Portland", 45.5152, -122.6784, 150),
        ("Seattle", 47.6062, -122.3321, 150),
        ("Anchorage", 61.2181, -149.9003, 250),
        ("Honolulu", 21.3099, -157.8581, 250),
        ("Toronto", 43.6532, -79.3832, 150),
        ("Montreal", 45.5017, -73.5673, 150),
        ("Vancouver", 49.2827, -123.1207, 150),
        ("Mexico City", 19.4326, -99.1332, 150),
        # ---- South America ----
        ("Bogota", 4.7110, -74.0721, 200),
        ("Lima", -12.0464, -77.0428, 200),
        ("Santiago", -33.4489, -70.6693, 200),
        ("Sao Paulo", -23.5558, -46.6396, 200),
        ("Rio de Janeiro", -22.9068, -43.1729, 200),
        ("Buenos Aires", -34.6037, -58.3816, 200),
        # ---- Europe ----
        ("London", 51.5074, -0.1278, 150),
        ("Paris", 48.8566, 2.3522, 150),
        ("Amsterdam", 52.3676, 4.9041, 150),
        ("Frankfurt", 50.1109, 8.6821, 150),
        ("Munich", 48.1351, 11.5820, 150),
        ("Madrid", 40.4168, -3.7038, 150),
        ("Barcelona", 41.3851, 2.1734, 150),
        ("Rome", 41.9028, 12.4964, 150),
        ("Istanbul", 41.0082, 28.9784, 150),
        ("Athens", 37.9838, 23.7275, 150),
        ("Vienna", 48.2082, 16.3738, 150),
        ("Warsaw", 52.2297, 21.0122, 150),
        ("Stockholm", 59.3293, 18.0686, 150),
        ("Oslo", 59.9139, 10.7522, 150),
        ("Moscow", 55.7558, 37.6173, 200),
        # ---- Middle East / Africa ----
        ("Cairo", 30.0444, 31.2357, 200),
        ("Tel Aviv", 32.0853, 34.7818, 150),
        ("Riyadh", 24.7136, 46.6753, 200),
        ("Dubai", 25.2048, 55.2708, 200),
        ("Doha", 25.2854, 51.5310, 200),
        ("Lagos", 6.5244, 3.3792, 250),
        ("Nairobi", -1.2921, 36.8219, 250),
        ("Johannesburg", -26.2041, 28.0473, 250),
        ("Casablanca", 33.5731, -7.5898, 200),
        # ---- Asia ----
        ("Mumbai", 19.0760, 72.8777, 200),
        ("Delhi", 28.7041, 77.1025, 200),
        ("Bangkok", 13.7563, 100.5018, 200),
        ("Singapore", 1.3521, 103.8198, 200),
        ("Jakarta", -6.2088, 106.8456, 200),
        ("Manila", 14.5995, 120.9842, 200),
        ("Hong Kong", 22.3193, 114.1694, 150),
        ("Shanghai", 31.2304, 121.4737, 200),
        ("Beijing", 39.9042, 116.4074, 200),
        ("Seoul", 37.5665, 126.9780, 150),
        ("Tokyo", 35.6762, 139.6503, 150),
        ("Osaka", 34.6937, 135.5023, 150),
        # ---- Oceania ----
        ("Sydney", -33.8688, 151.2093, 200),
        ("Melbourne", -37.8136, 144.9631, 200),
        ("Brisbane", -27.4698, 153.0251, 200),
        ("Perth", -31.9505, 115.8605, 200),
        ("Auckland", -36.8485, 174.7633, 200),
    ]
    per_region_cap = max(3, AIRCRAFT_LIMIT // len(points) + 1)

    def fetch_region(point):
        area_, lat_, lon_, radius_ = point
        try:
            data = fetch_json(
                f"https://api.airplanes.live/v2/point/{lat_}/{lon_}/{radius_}",
                timeout=3,
            )
            return area_, data.get("ac") or []
        except Exception:
            return area_, None

    region_results: list[tuple[str, list[Any] | None]] = []
    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = {pool.submit(fetch_region, p): p for p in points}
        for future in as_completed(futures):
            try:
                region_results.append(future.result())
            except Exception:
                continue

    seen: set[str] = set()
    added = 0
    for area, aircraft in region_results:
        if aircraft is None:
            continue
        if added >= AIRCRAFT_LIMIT:
            break
        if "airplanes.live" not in sources:
            sources.append("airplanes.live")
        # Random-sample within each region so we don't always show the same
        # approach-stack at the centre of the city.
        if len(aircraft) > per_region_cap * 4:
            try:
                aircraft = random.sample(aircraft, per_region_cap * 4)
            except ValueError:
                pass
        region_added = 0
        for item in aircraft:
            if region_added >= per_region_cap or added >= AIRCRAFT_LIMIT:
                break
            if not isinstance(item, dict):
                continue
            item_lat = item.get("lat")
            item_lon = item.get("lon")
            hex_id = item.get("hex")
            if item_lat is None or item_lon is None or not hex_id or hex_id in seen:
                continue
            seen.add(hex_id)
            callsign = (item.get("flight") or item.get("r") or "Unknown flight").strip() or "Unknown flight"
            alt_raw = item.get("alt_baro")
            altitude = 0 if alt_raw == "ground" else alt_raw
            speed = item.get("gs")
            track = item.get("track")
            registration = item.get("r") or "n/a"
            aircraft_type = item.get("t") or "n/a"
            add_event(events, {
                "id": f"aircraft-alive-{hex_id}",
                "layer": "aircraft",
                "source": "airplanes.live",
                "title": f"{callsign} aircraft track",
                "summary": f"{area} ADS-B aircraft. Altitude {altitude if altitude is not None else 'n/a'} ft, ground speed {speed if speed is not None else 'n/a'} kt.",
                "severity": "low",
                "time": datetime.now(timezone.utc).isoformat(),
                "lat": item_lat,
                "lon": item_lon,
                "url": "https://airplanes.live/",
                "details": {
                    "Callsign": callsign,
                    "Registration": registration,
                    "Aircraft type": aircraft_type,
                    "Altitude": f"{altitude} ft" if altitude is not None else "n/a",
                    "Ground speed": f"{speed} kt" if speed is not None else "n/a",
                    "Heading": f"{track} deg" if track is not None else "n/a",
                    "ICAO24": hex_id,
                    "Area": area,
                },
            })
            added += 1
            region_added += 1

    return added > 0


def load_adsb_lol_aircraft(events: list[dict[str, Any]], sources: list[str]) -> None:
    # Densely sample geography with small per-region caps so planes are
    # visually spread across continents rather than piled at hubs.
    # ~30 points × ~4 planes each → ~110 aircraft total, uniformly placed.
    points = [
        # United States — wide coverage so planes show across the whole country,
        # not just NYC / LAX / SFO
        ("Boston", 42.3601, -71.0589, 150),
        ("New York", 40.7128, -74.0060, 150),
        ("Washington DC", 38.9072, -77.0369, 150),
        ("Atlanta", 33.7490, -84.3880, 150),
        ("Miami", 25.7617, -80.1918, 150),
        ("Charlotte", 35.2271, -80.8431, 150),
        ("Chicago", 41.8781, -87.6298, 150),
        ("Detroit", 42.3314, -83.0458, 150),
        ("Minneapolis", 44.9778, -93.2650, 150),
        ("Houston", 29.7604, -95.3698, 150),
        ("Dallas", 32.7767, -96.7970, 150),
        ("Denver", 39.7392, -104.9903, 150),
        ("Phoenix", 33.4484, -112.0740, 150),
        ("Salt Lake City", 40.7608, -111.8910, 150),
        ("Las Vegas", 36.1699, -115.1398, 150),
        ("San Francisco", 37.7749, -122.4194, 150),
        ("Los Angeles", 34.0522, -118.2437, 150),
        ("Seattle", 47.6062, -122.3321, 150),
        ("Anchorage", 61.2181, -149.9003, 200),
        ("Honolulu", 21.3099, -157.8581, 200),
        # Canada
        ("Toronto", 43.6532, -79.3832, 150),
        ("Vancouver", 49.2827, -123.1207, 150),
        # Mexico / Caribbean
        ("Mexico City", 19.4326, -99.1332, 150),
        # Europe
        ("London", 51.5074, -0.1278, 150),
        ("Paris", 48.8566, 2.3522, 150),
        ("Frankfurt", 50.1109, 8.6821, 150),
        ("Madrid", 40.4168, -3.7038, 150),
        ("Rome", 41.9028, 12.4964, 150),
        ("Istanbul", 41.0082, 28.9784, 150),
        ("Stockholm", 59.3293, 18.0686, 150),
        # Asia / Middle East
        ("Dubai", 25.2048, 55.2708, 150),
        ("Mumbai", 19.0760, 72.8777, 150),
        ("Singapore", 1.3521, 103.8198, 150),
        ("Hong Kong", 22.3193, 114.1694, 150),
        # Africa
        ("Johannesburg", -26.2041, 28.0473, 150),
    ]
    per_region_cap = max(3, AIRCRAFT_LIMIT // len(points) + 1)
    seen: set[str] = set()
    added = 0

    # Fetch all regions in parallel so a slow point doesn't block fast ones.
    def fetch_region(point):
        area_, lat_, lon_, radius_ = point
        try:
            data = fetch_json(f"https://api.adsb.lol/v2/point/{lat_}/{lon_}/{radius_}", timeout=4)
            return area_, data.get("ac") or []
        except Exception:
            return area_, None

    with ThreadPoolExecutor(max_workers=12) as pool:
        future_to_point = {pool.submit(fetch_region, p): p for p in points}
        region_results = []
        for future in as_completed(future_to_point):
            try:
                region_results.append(future.result())
            except Exception:
                continue

    for area, aircraft in region_results:
        if aircraft is None:
            continue
        if added >= AIRCRAFT_LIMIT:
            break
        if "ADSB.lol" not in sources:
            sources.append("ADSB.lol")
        # Random sample so we don't always take the same airport-approach
        # cluster from the centre of each region. Spread is much more uniform.
        if len(aircraft) > per_region_cap * 4:
            try:
                aircraft = random.sample(aircraft, per_region_cap * 4)
            except ValueError:
                pass
        region_added = 0
        for item in aircraft:
            if region_added >= per_region_cap or added >= AIRCRAFT_LIMIT:
                break
            if not isinstance(item, dict):
                continue
            item_lat = item.get("lat")
            item_lon = item.get("lon")
            hex_id = item.get("hex")
            if item_lat is None or item_lon is None or not hex_id or hex_id in seen:
                continue
            seen.add(hex_id)
            callsign = (item.get("flight") or item.get("r") or "Unknown flight").strip() or "Unknown flight"
            altitude = item.get("alt_baro") if item.get("alt_baro") != "ground" else 0
            speed = item.get("gs")
            track = item.get("track")
            registration = item.get("r") or "n/a"
            aircraft_type = item.get("t") or "n/a"
            add_event(events, {
                "id": f"aircraft-adsblol-{hex_id}",
                "layer": "aircraft",
                "source": "ADSB.lol",
                "title": f"{callsign} aircraft track",
                "summary": f"{area} ADS-B aircraft. Altitude {altitude if altitude is not None else 'n/a'} ft, ground speed {speed if speed is not None else 'n/a'} kt.",
                "severity": "low",
                "time": datetime.now(timezone.utc).isoformat(),
                "lat": item_lat,
                "lon": item_lon,
                "url": "https://www.adsb.lol/",
                "details": {
                    "Callsign": callsign,
                    "Registration": registration,
                    "Aircraft type": aircraft_type,
                    "Altitude": f"{altitude} ft" if altitude is not None else "n/a",
                    "Ground speed": f"{speed} kt" if speed is not None else "n/a",
                    "Heading": f"{track} deg" if track is not None else "n/a",
                    "ICAO24": hex_id,
                    "Area": area,
                },
            })
            added += 1
            region_added += 1


def weather_text(code: Any) -> str:
    try:
        code_int = int(code)
    except (TypeError, ValueError):
        return "Observed conditions"
    return {
        0: "Clear",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Fog",
        48: "Depositing rime fog",
        51: "Light drizzle",
        53: "Drizzle",
        55: "Dense drizzle",
        61: "Light rain",
        63: "Rain",
        65: "Heavy rain",
        71: "Light snow",
        73: "Snow",
        75: "Heavy snow",
        80: "Rain showers",
        81: "Rain showers",
        82: "Violent rain showers",
        95: "Thunderstorm",
    }.get(code_int, "Observed conditions")


def load_live_weather(events: list[dict[str, Any]], sources: list[str]) -> None:
    lats = "%2C".join(str(item[1]) for item in WEATHER_LOCATIONS)
    lons = "%2C".join(str(item[2]) for item in WEATHER_LOCATIONS)
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lats}&longitude={lons}"
        "&current=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m"
        "&timezone=UTC"
    )
    data = fetch_json(url, timeout=16)
    rows = data if isinstance(data, list) else [data]
    sources.append("Open-Meteo")
    for (name, lat, lon), row in zip(WEATHER_LOCATIONS, rows):
        current = row.get("current", {})
        temp = current.get("temperature_2m")
        wind = current.get("wind_speed_10m")
        precip = current.get("precipitation")
        condition = weather_text(current.get("weather_code"))
        level = "medium" if (precip or 0) > 0 or (wind or 0) > 35 else "low"
        add_event(events, {
            "id": f"weather-live-{name}",
            "layer": "weather",
            "source": "Open-Meteo",
            "title": f"Live weather: {name}",
            "summary": f"{condition}. {temp} C, wind {wind} km/h, precipitation {precip} mm.",
            "severity": level,
            "time": current.get("time") or datetime.now(timezone.utc).isoformat(),
            "lat": lat,
            "lon": lon,
            "url": "https://open-meteo.com/",
            "details": {
                "Condition": condition,
                "Temperature": f"{temp} C",
                "Wind": f"{wind} km/h",
                "Wind direction": f"{current.get('wind_direction_10m')} deg",
                "Precipitation": f"{precip} mm",
                "Provider": "Open-Meteo",
            },
        })


def aqi_severity(value: Any) -> str:
    try:
        aqi = float(value)
    except (TypeError, ValueError):
        return "low"
    if aqi >= 151:
        return "high"
    if aqi >= 51:
        return "medium"
    return "low"


def load_air_quality(events: list[dict[str, Any]], sources: list[str]) -> None:
    lats = ",".join(str(item[1]) for item in WEATHER_LOCATIONS)
    lons = ",".join(str(item[2]) for item in WEATHER_LOCATIONS)
    url = (
        "https://air-quality-api.open-meteo.com/v1/air-quality"
        f"?latitude={urllib.parse.quote(lats)}&longitude={urllib.parse.quote(lons)}"
        "&current=us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone"
        "&timezone=UTC"
    )
    data = fetch_json(url, timeout=16)
    rows = data if isinstance(data, list) else [data]
    sources.append("Open-Meteo Air Quality")
    for (name, lat, lon), row in zip(WEATHER_LOCATIONS, rows):
        current = row.get("current", {})
        aqi = current.get("us_aqi")
        pm25 = current.get("pm2_5")
        pm10 = current.get("pm10")
        add_event(events, {
            "id": f"air-quality-{name}",
            "layer": "air-quality",
            "source": "Open-Meteo Air Quality",
            "title": f"Air quality: {name}",
            "summary": f"Current AQI {aqi if aqi is not None else 'n/a'}, PM2.5 {pm25 if pm25 is not None else 'n/a'}, PM10 {pm10 if pm10 is not None else 'n/a'}.",
            "severity": aqi_severity(aqi),
            "time": current.get("time") or datetime.now(timezone.utc).isoformat(),
            "lat": lat,
            "lon": lon,
            "url": "https://open-meteo.com/en/docs/air-quality-api",
            "details": {
                "US AQI": aqi if aqi is not None else "n/a",
                "PM2.5": f"{pm25} ug/m3" if pm25 is not None else "n/a",
                "PM10": f"{pm10} ug/m3" if pm10 is not None else "n/a",
                "Ozone": f"{current.get('ozone')} ug/m3" if current.get("ozone") is not None else "n/a",
                "NO2": f"{current.get('nitrogen_dioxide')} ug/m3" if current.get("nitrogen_dioxide") is not None else "n/a",
                "CO": f"{current.get('carbon_monoxide')} ug/m3" if current.get("carbon_monoxide") is not None else "n/a",
            },
        })


def load_ocean_levels(events: list[dict[str, Any]], sources: list[str]) -> None:
    appended_source = False
    for name, station, lat, lon in OCEAN_STATIONS:
        query = urllib.parse.urlencode({
            "product": "water_level",
            "application": "MatrixAI",
            "date": "latest",
            "datum": "MLLW",
            "station": station,
            "time_zone": "gmt",
            "units": "metric",
            "format": "json",
        })
        data = fetch_json(f"https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?{query}", timeout=8)
        rows = data.get("data") or []
        if not rows:
            continue
        if not appended_source:
            sources.append("NOAA CO-OPS")
            appended_source = True
        row = rows[0]
        value = row.get("v")
        add_event(events, {
            "id": f"ocean-level-{station}",
            "layer": "ocean",
            "source": "NOAA CO-OPS",
            "title": f"Water level: {name}",
            "summary": f"Latest NOAA CO-OPS water level is {value if value is not None else 'n/a'} m relative to MLLW.",
            "severity": "low",
            "time": row.get("t") or datetime.now(timezone.utc).isoformat(),
            "lat": lat,
            "lon": lon,
            "url": f"https://tidesandcurrents.noaa.gov/stationhome.html?id={station}",
            "details": {
                "Station": station,
                "Water level": f"{value} m" if value is not None else "n/a",
                "Datum": "MLLW",
                "Quality": row.get("q") or "n/a",
                "Flags": row.get("f") or "n/a",
            },
        })


def load_marine_weather(events: list[dict[str, Any]], sources: list[str]) -> None:
    lats = ",".join(str(item[1]) for item in MARINE_LOCATIONS)
    lons = ",".join(str(item[2]) for item in MARINE_LOCATIONS)
    url = (
        "https://marine-api.open-meteo.com/v1/marine"
        f"?latitude={urllib.parse.quote(lats)}&longitude={urllib.parse.quote(lons)}"
        "&current=wave_height,wave_direction,wave_period,ocean_current_velocity,ocean_current_direction,sea_surface_temperature"
        "&timezone=UTC"
    )
    data = fetch_json(url, timeout=16)
    rows = data if isinstance(data, list) else [data]
    sources.append("Open-Meteo Marine")
    for (name, lat, lon), row in zip(MARINE_LOCATIONS, rows):
        current = row.get("current", {})
        wave_height = current.get("wave_height")
        wave_period = current.get("wave_period")
        current_velocity = current.get("ocean_current_velocity")
        add_event(events, {
            "id": f"marine-{name}",
            "layer": "ocean",
            "source": "Open-Meteo Marine",
            "title": f"Marine conditions: {name}",
            "summary": f"Wave height {wave_height if wave_height is not None else 'n/a'} m, period {wave_period if wave_period is not None else 'n/a'} s, current {current_velocity if current_velocity is not None else 'n/a'} m/s.",
            "severity": "medium" if (wave_height or 0) >= 3 else "low",
            "time": current.get("time") or datetime.now(timezone.utc).isoformat(),
            "lat": lat,
            "lon": lon,
            "url": "https://open-meteo.com/en/docs/marine-weather-api",
            "details": {
                "Wave height": f"{wave_height} m" if wave_height is not None else "n/a",
                "Wave period": f"{wave_period} s" if wave_period is not None else "n/a",
                "Wave direction": f"{current.get('wave_direction')} deg" if current.get("wave_direction") is not None else "n/a",
                "Ocean current": f"{current_velocity} m/s" if current_velocity is not None else "n/a",
                "Current direction": f"{current.get('ocean_current_direction')} deg" if current.get("ocean_current_direction") is not None else "n/a",
                "Sea temp": f"{current.get('sea_surface_temperature')} C" if current.get("sea_surface_temperature") is not None else "n/a",
            },
        })


def load_emsc_seismic(events: list[dict[str, Any]], sources: list[str]) -> None:
    data = fetch_json(
        "https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=80&orderby=time",
        timeout=10,
    )
    sources.append("EMSC")
    for feature in data.get("features", [])[:80]:
        props = feature.get("properties", {})
        geometry = feature.get("geometry") or {}
        coords = geometry.get("coordinates", [])
        if len(coords) < 2:
            continue
        magnitude = props.get("mag")
        if magnitude is None or magnitude < 2.5:
            continue
        region = props.get("flynn_region") or "Unknown region"
        add_event(events, {
            "id": f"emsc-{props.get('source_id') or feature.get('id')}",
            "layer": "earthquake",
            "source": "EMSC",
            "title": f"M{magnitude} {region}" if magnitude is not None else f"Seismic event {region}",
            "summary": f"EMSC reports magnitude {magnitude} seismic event near {region}.",
            "severity": severity_from_magnitude(magnitude),
            "time": props.get("time") or datetime.now(timezone.utc).isoformat(),
            "lat": coords[1],
            "lon": coords[0],
            "url": props.get("source_catalog") and f"https://www.seismicportal.eu/eventdetails.html?unid={props.get('unid')}",
            "details": {
                "Magnitude": magnitude,
                "Region": region,
                "Depth": f"{coords[2]} km" if len(coords) > 2 else "n/a",
                "Auth": props.get("auth") or "EMSC",
            },
        })


def load_geonet_quakes(events: list[dict[str, Any]], sources: list[str]) -> None:
    data = fetch_json("https://api.geonet.org.nz/quake?MMI=3", timeout=10)
    sources.append("GeoNet NZ")
    for feature in data.get("features", [])[:30]:
        props = feature.get("properties", {})
        geometry = feature.get("geometry") or {}
        coords = geometry.get("coordinates", [])
        if len(coords) < 2:
            continue
        magnitude = props.get("magnitude")
        if magnitude is None or magnitude < 2.5:
            continue
        locality = props.get("locality") or "New Zealand region"
        add_event(events, {
            "id": f"geonet-{props.get('publicID') or feature.get('id')}",
            "layer": "earthquake",
            "source": "GeoNet NZ",
            "title": f"M{round(magnitude, 1)} {locality}" if magnitude is not None else f"NZ quake {locality}",
            "summary": f"GeoNet New Zealand reports magnitude {magnitude} seismic event near {locality}.",
            "severity": severity_from_magnitude(magnitude),
            "time": props.get("time") or datetime.now(timezone.utc).isoformat(),
            "lat": coords[1],
            "lon": coords[0],
            "url": f"https://www.geonet.org.nz/earthquake/{props.get('publicID')}",
            "details": {
                "Magnitude": magnitude,
                "MMI": props.get("mmi"),
                "Depth": f"{props.get('depth')} km" if props.get("depth") is not None else "n/a",
                "Locality": locality,
                "Quality": props.get("quality"),
            },
        })


def load_iss_position(events: list[dict[str, Any]], sources: list[str]) -> None:
    data = fetch_json("https://api.wheretheiss.at/v1/satellites/25544", timeout=8)
    sources.append("Where the ISS at")
    lat = data.get("latitude")
    lon = data.get("longitude")
    if lat is None or lon is None:
        return
    altitude = data.get("altitude")
    velocity = data.get("velocity")
    add_event(events, {
        "id": "iss-current",
        "layer": "satellite",
        "source": "Where the ISS at",
        "title": "ISS — International Space Station",
        "summary": f"ISS subpoint. Altitude {round(altitude or 0)} km, velocity {round(velocity or 0)} km/h.",
        "severity": "low",
        "time": datetime.now(timezone.utc).isoformat(),
        "lat": lat,
        "lon": lon,
        "url": "https://wheretheiss.at/",
        "details": {
            "Satellite": "ISS (ZARYA)",
            "Altitude": f"{round(altitude or 0)} km",
            "Velocity": f"{round(velocity or 0)} km/h",
            "Visibility": data.get("visibility") or "n/a",
            "Footprint": f"{round(data.get('footprint') or 0)} km",
        },
    })


def load_nhc_storms(events: list[dict[str, Any]], sources: list[str]) -> None:
    """NOAA NHC active tropical cyclones (Atlantic + Pacific)."""
    try:
        data = fetch_json("https://www.nhc.noaa.gov/CurrentStorms.json", timeout=10)
    except Exception:
        return
    storms = data.get("activeStorms") or data.get("activestorms") or []
    if not storms:
        return
    sources.append("NOAA NHC")
    for storm in storms[:20]:
        try:
            lat = float(storm.get("centerLatitude") or storm.get("latitudeNumeric") or 0)
            lon = float(storm.get("centerLongitude") or storm.get("longitudeNumeric") or 0)
        except (TypeError, ValueError):
            continue
        name = storm.get("name") or storm.get("id") or "Active storm"
        classification = storm.get("classification") or storm.get("type") or "Tropical cyclone"
        add_event(events, {
            "id": f"nhc-{storm.get('id') or name}",
            "layer": "disaster",
            "source": "NOAA NHC",
            "title": f"{classification} {name}",
            "summary": f"NOAA NHC active storm {name} ({classification}).",
            "severity": "high",
            "time": storm.get("lastUpdate") or datetime.now(timezone.utc).isoformat(),
            "lat": lat,
            "lon": lon,
            "url": storm.get("publicAdvisory", {}).get("url") if isinstance(storm.get("publicAdvisory"), dict) else storm.get("url"),
            "details": {
                "Name": name,
                "Classification": classification,
                "Basin": storm.get("binNumber") or storm.get("basin") or "n/a",
                "Movement": storm.get("movement") or "n/a",
                "Intensity": storm.get("intensity") or "n/a",
                "Pressure": storm.get("pressure") or "n/a",
            },
        })


def load_volcano_eonet(events: list[dict[str, Any]], sources: list[str]) -> None:
    """Active volcanoes via NASA EONET filtered category endpoint."""
    try:
        data = fetch_json(
            "https://eonet.gsfc.nasa.gov/api/v3/events?category=volcanoes&status=open&limit=40",
            timeout=10,
        )
    except Exception:
        return
    sources.append("EONET Volcanoes")
    for item in data.get("events", [])[:30]:
        geometry = item.get("geometry") or []
        if not geometry:
            continue
        geo = geometry[-1]
        coords = geo.get("coordinates", [])
        if isinstance(coords, list) and coords and isinstance(coords[0], list):
            coords = coords[0]
        if len(coords) < 2:
            continue
        add_event(events, {
            "id": f"volcano-{item.get('id')}",
            "layer": "natural",
            "source": "EONET Volcanoes",
            "title": item.get("title") or "Active volcano",
            "summary": "Active volcanic event tracked by NASA EONET.",
            "severity": "high",
            "time": geo.get("date") or datetime.now(timezone.utc).isoformat(),
            "lat": coords[1],
            "lon": coords[0],
            "url": item.get("link"),
            "details": {
                "Category": "Volcano",
                "EONET ID": item.get("id"),
                "Status": item.get("closed") or "Open",
            },
        })


def load_wildfire_eonet(events: list[dict[str, Any]], sources: list[str]) -> None:
    """Active wildfires via NASA EONET."""
    try:
        data = fetch_json(
            "https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open&limit=60",
            timeout=10,
        )
    except Exception:
        return
    sources.append("EONET Wildfires")
    for item in data.get("events", [])[:50]:
        geometry = item.get("geometry") or []
        if not geometry:
            continue
        geo = geometry[-1]
        coords = geo.get("coordinates", [])
        if isinstance(coords, list) and coords and isinstance(coords[0], list):
            coords = coords[0]
        if len(coords) < 2:
            continue
        add_event(events, {
            "id": f"wildfire-{item.get('id')}",
            "layer": "natural",
            "source": "EONET Wildfires",
            "title": item.get("title") or "Active wildfire",
            "summary": "Active wildfire tracked by NASA EONET satellite observations.",
            "severity": "high",
            "time": geo.get("date") or datetime.now(timezone.utc).isoformat(),
            "lat": coords[1],
            "lon": coords[0],
            "url": item.get("link"),
            "details": {
                "Category": "Wildfire",
                "EONET ID": item.get("id"),
                "Status": item.get("closed") or "Open",
            },
        })


def load_cameras(events: list[dict[str, Any]], sources: list[str]) -> None:
    sources.extend(sorted({camera["source"] for camera in CAMERAS}))
    for camera in CAMERAS:
        add_event(events, {
            "id": f"camera-{camera['id']}",
            "layer": "camera",
            "source": camera["source"],
            "title": camera["title"],
            "summary": camera["summary"],
            "severity": "low",
            "time": datetime.now(timezone.utc).isoformat(),
            "lat": camera["lat"],
            "lon": camera["lon"],
            "url": camera["url"],
            "imageUrl": camera.get("imageUrl"),
            "liveUrl": camera.get("liveUrl"),
            "embedUrl": camera.get("embedUrl"),
            "thumbnailUrl": camera.get("thumbnailUrl") or camera.get("imageUrl"),
            "details": {
                "Provider": camera["source"],
                "Camera mode": "Live stream page" if camera.get("liveUrl") else "Updating agency still",
                "Refresh": "Agency controlled",
                "Latitude": camera["lat"],
                "Longitude": camera["lon"],
            },
        })


def parse_tle(text: str, limit: int = 120) -> list[dict[str, str]]:
    lines = [line.rstrip() for line in text.splitlines() if line.strip()]
    satellites: list[dict[str, str]] = []
    i = 0
    while i + 2 < len(lines) and len(satellites) < limit:
        name, line1, line2 = lines[i], lines[i + 1], lines[i + 2]
        if line1.startswith("1 ") and line2.startswith("2 "):
            satellites.append({
                "name": re.sub(r"\s+", " ", name).strip(),
                "line1": line1.strip(),
                "line2": line2.strip(),
            })
            i += 3
        else:
            i += 1
    return satellites


def build_satellite_payload() -> dict[str, Any]:
    now = time.time()
    if satellite_cache["payload"] and now - satellite_cache["at"] < 300:
        return satellite_cache["payload"]
    sources = ["TLE API"]
    satellites: list[dict[str, str]] = []
    for sat_id in SATELLITE_IDS:
        try:
            item = fetch_json(f"https://tle.ivanstanojevic.me/api/tle/{sat_id}", timeout=6)
            if item.get("line1") and item.get("line2"):
                satellites.append({
                    "name": item.get("name") or str(sat_id),
                    "line1": item["line1"],
                    "line2": item["line2"],
                })
        except Exception:
            continue
    if len(satellites) < 6:
        text = fetch_text("https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle", timeout=12)
        satellites = parse_tle(text, 120)
        sources.append("CelesTrak fallback")
    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "sources": sources,
        "satellites": satellites,
    }
    satellite_cache["at"] = now
    satellite_cache["payload"] = payload
    return payload


def fallback_events() -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc).isoformat()
    return [
        {
            "id": "fallback-usgs",
            "layer": "earthquake",
            "source": "USGS Earthquake",
            "title": "Live feed pending: seismic monitor",
            "summary": "The dashboard is online and waiting for the next USGS seismic update.",
            "severity": "low",
            "time": now,
            "lat": 37.77,
            "lon": -122.42,
            "url": "https://earthquake.usgs.gov/",
        },
        {
            "id": "fallback-gdacs",
            "layer": "disaster",
            "source": "GDACS",
            "title": "Live feed pending: global disaster monitor",
            "summary": "GDACS integration is configured. This placeholder is used only if upstream data is unreachable.",
            "severity": "medium",
            "time": now,
            "lat": 46.05,
            "lon": 14.51,
            "url": "https://www.gdacs.org/",
        },
    ]


def build_payload() -> dict[str, Any]:
    now = time.time()
    if cache["payload"] and now - cache["at"] < CACHE_TTL_SECONDS:
        return cache["payload"]

    events: list[dict[str, Any]] = []
    sources: list[str] = []
    errors: list[str] = []
    for loader in (
        load_usgs,
        load_emsc_seismic,
        load_geonet_quakes,
        load_gdacs,
        load_eonet,
        load_volcano_eonet,
        load_wildfire_eonet,
        load_nhc_storms,
        load_space_weather,
        load_weather_alerts,
        load_live_weather,
        load_air_quality,
        load_ocean_levels,
        load_marine_weather,
        load_aircraft,
        load_iss_position,
        load_cameras,
    ):
        try:
            loader(events, sources)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError, ValueError, KeyError, TypeError) as exc:
            errors.append(f"{loader.__name__}: {exc}")

    events.sort(key=lambda item: item.get("time") or "", reverse=True)
    if not events:
        events = fallback_events()

    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "sources": sorted(set(sources)),
        "errors": errors,
        "events": events[:1200],
    }
    cache["at"] = now
    cache["payload"] = payload
    return payload


NEWS_FEEDS = [
    # Artificial intelligence — THE PRIMARY (and essentially only) news focus
    ("TechCrunch AI", "https://techcrunch.com/category/artificial-intelligence/feed/", "ai"),
    ("MIT Tech Review", "https://www.technologyreview.com/feed/", "ai"),
    ("VentureBeat AI", "https://venturebeat.com/category/ai/feed", "ai"),
    ("OpenAI News", "https://openai.com/news/rss.xml", "ai"),
    ("NVIDIA Blog", "https://blogs.nvidia.com/feed/", "ai"),
    ("The Decoder", "https://the-decoder.com/feed/", "ai"),
    ("Marktechpost", "https://www.marktechpost.com/feed/", "ai"),
    ("Hugging Face", "https://huggingface.co/blog/feed.xml", "ai"),
    ("Synced Review", "https://syncedreview.com/feed/", "ai"),
    ("Apple ML", "https://machinelearning.apple.com/rss.xml", "ai"),
    ("Google AI Blog", "https://blog.google/technology/ai/rss/", "ai"),
    ("Cohere Blog", "https://cohere.com/blog/rss.xml", "ai"),
    ("Databricks", "https://www.databricks.com/feed", "ai"),
    # World feeds scanned for EMERGENCY-level breaking ONLY (safety channel).
    # Non-emergency items from these feeds are dropped.
    ("BBC World", "http://feeds.bbci.co.uk/news/world/rss.xml", "world"),
    ("Reuters World", "https://www.reutersagency.com/feed/?best-regions=africa,asia,europe,middle-east,north-america,south-america&post_type=best", "world"),
    ("CNN Top Stories", "http://rss.cnn.com/rss/cnn_topstories.rss", "world"),
    ("Guardian World", "https://www.theguardian.com/world/rss", "world"),
    ("NPR News", "https://feeds.npr.org/1001/rss.xml", "us"),
]

# Emergency-level breaking news filter applied to the world/us feeds. Only items
# matching one of these high-severity tokens survive (then they are re-tagged
# category "emergency"). Everything else from those feeds is discarded so the
# rail stays AI-focused with only genuinely major world events alongside.
EMERGENCY_RE = re.compile(
    r"\b(breaking|emergency|killed|dead|death\s*toll|fatal|mass\s*shooting|shooting|"
    r"gunman|attack|terror|terrorist|bombing|explosion|blast|earthquake|magnitude|"
    r"tsunami|hurricane|typhoon|cyclone|wildfire|flood|landslide|evacuat|disaster|"
    r"\bwar\b|invasion|airstrike|missile|nuclear|outbreak|pandemic|hostage|collapse|"
    r"state\s*of\s*emergency|martial\s*law|coup|assassinat|catastroph|derail|"
    r"plane\s*crash|train\s*crash)\b",
    re.IGNORECASE,
)

AI_NEWS_RE = re.compile(
    r"\b(ai|a\.i\.|artificial intelligence|machine learning|ml|llm|large language model|"
    r"generative|genai|agentic|agents?|openai|chatgpt|gpt|codex|anthropic|claude|"
    r"gemini|deepmind|deepseek|mistral|cohere|perplexity|hugging\s*face|nvidia|gpu|"
    r"neural|transformer|diffusion|robotics?|models?|inference|training|fine[-\s]?tuning|"
    r"datasets?|prompts?)\b",
    re.IGNORECASE,
)


# Topic filters for video feeds. Anything that doesn't mention these tokens
# in title or description gets skipped (case-insensitive).
AI_VIDEO_KEYWORDS = re.compile(
    r"(\ba\.?i\.?\b|artificial intelligence|open\s*ai|openai|codex|agent|agentic|hermes|"
    r"open\s*claw|deepseek|\bmodel|claude|claude code|anthropic|chatgpt|gpt|\bllm|llama|"
    r"mistral|gemini|grok|reasoning|neural|robot|automation|copilot|perplexity|desktop|"
    r"prompt|nvidia|machine learning|\bml\b|inference|fine-?tun|transformer|diffusion|"
    r"generative|release|launch|breaking|research|tool|developer)",
    re.IGNORECASE,
)
# POE2 / Path of Exile 2 only — strictly filtered
GAMING_VIDEO_KEYWORDS = re.compile(
    r"(path\s*of\s*exile\s*2|\bpoe\s*2\b|\bpoe2\b)",
    re.IGNORECASE,
)

AI_YT_CHANNELS = [
    ("Anthropic", "@anthropic-ai"),
    ("Claude", "@claude"),
    ("AI Explained", "UCNJ1Ymd5yFuUPtn21xtRbbw"),
    ("Lex Fridman", "UCSHZKyawb77ixDdsGog4iWA"),
    ("MKBHD", "UCBJycsmduvYEL83R_U4JriQ"),
    ("Matt Wolfe", "UCJIfeSCssxSC_Dhc5s7woww"),
    ("OpenAI", "UCXZCJLdBC09xxGZ6gcdrc6A"),
    ("Google AI", "UCcefcZRL2oaA_uBNeo5UOWg"),
    ("Google DeepMind", "@googledeepmind"),
    ("GitHub", "github"),
    ("Hugging Face", "UCHlNU7kIZhRgSbhHvFoy72w"),
    ("AI Daily Brief", "UC2WmuBuFq6gL08QYG-JjXKw"),
    ("Wes Roth", "UCSv4qL8vmoSH7GaPjuqRiCQ"),
    ("Fireship", "UCMLtBahI5DMrt0NPvDSoIRQ"),
]

GAMING_YT_CHANNELS = [
    # Path of Exile 2 dedicated creators
    ("Palsteron", "UCXp5YOW329ysRDl_LK9P1_g"),
    ("Moxsy", "UCqUYttljh7bvi6mvHzpiMIA"),
    ("ExiledAgain", "UCqFftuISNP9zT2TFkHnDNJg"),
    ("Path of Exile", "UCA7X5unt1JrIiVReQDUbl_A"),
    ("Jorgen", "UCgpVs9wn5iFMBWFUSgf21Hw"),
    ("Fubgun", "UCPC9EGNDaVOJJyavLfVQpZg"),
    ("P4wnyhof", "UCni5pNpPYvejsMn1yWDsMNA"),
    ("GhazzyTV", "UCoZit1xdwD_46j8sZWRKhoA"),
    # General gaming news (POE2-filtered)
    ("IGN", "UCKy1dAqELo0zrOtPkf0eTMw"),
]


def youtube_channel_feed_url(channel_ref: str) -> str | None:
    ref = (channel_ref or "").strip()
    if not ref:
        return None
    if ref.startswith("UC"):
        return f"https://www.youtube.com/feeds/videos.xml?channel_id={urllib.parse.quote(ref)}"

    cached = youtube_channel_id_cache.get(ref)
    if cached:
        return f"https://www.youtube.com/feeds/videos.xml?channel_id={urllib.parse.quote(cached)}"

    if ref.startswith("http"):
        page_url = ref
    elif ref.startswith("/"):
        page_url = f"https://www.youtube.com{ref}"
    elif ref.startswith("@"):
        page_url = f"https://www.youtube.com/{urllib.parse.quote(ref)}"
    else:
        page_url = f"https://www.youtube.com/{urllib.parse.quote(ref)}"

    try:
        page = fetch_text(page_url, timeout=8)
    except Exception:
        return None

    patterns = [
        r'"channelId"\s*:\s*"(UC[a-zA-Z0-9_-]{20,})"',
        r'"externalId"\s*:\s*"(UC[a-zA-Z0-9_-]{20,})"',
        r'<meta\s+itemprop="channelId"\s+content="(UC[a-zA-Z0-9_-]{20,})"',
        r'https://www\.youtube\.com/channel/(UC[a-zA-Z0-9_-]{20,})',
    ]
    for pattern in patterns:
        match = re.search(pattern, page)
        if match:
            channel_id = match.group(1)
            youtube_channel_id_cache[ref] = channel_id
            return f"https://www.youtube.com/feeds/videos.xml?channel_id={urllib.parse.quote(channel_id)}"
    return None


def fetch_youtube_channel_feed(
    channel_ref: str,
    source: str,
    category: str,
    max_age_minutes: int,
    keyword_filter: re.Pattern[str] | None = None,
) -> list[dict[str, Any]]:
    """Pull a YouTube channel RSS (Atom) feed and return recent videos.
    If keyword_filter is supplied, only videos whose title OR description match the
    pattern are kept (case-insensitive)."""
    url = youtube_channel_feed_url(channel_ref)
    if not url:
        return []
    try:
        xml_text = fetch_text(url, timeout=6)
    except Exception:
        return []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []
    ns = {
        "a": "http://www.w3.org/2005/Atom",
        "yt": "http://www.youtube.com/xml/schemas/2015",
        "media": "http://search.yahoo.com/mrss/",
    }
    cutoff = datetime.now(timezone.utc).timestamp() - max_age_minutes * 60
    out: list[dict[str, Any]] = []
    for entry in root.findall("a:entry", ns):
        video_id_el = entry.find("yt:videoId", ns)
        if video_id_el is None or not video_id_el.text:
            continue
        video_id = video_id_el.text
        title_el = entry.find("a:title", ns)
        title = strip_html(title_el.text if title_el is not None else "") or "Untitled"
        pub_el = entry.find("a:published", ns)
        pub_iso = (pub_el.text if pub_el is not None else None) or datetime.now(timezone.utc).isoformat()
        try:
            pub_dt = datetime.fromisoformat(pub_iso.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            continue
        if pub_dt.timestamp() < cutoff:
            continue
        # Description (in media:group/media:description)
        description = ""
        mg = entry.find("media:group", ns)
        if mg is not None:
            d = mg.find("media:description", ns)
            if d is not None and d.text:
                description = strip_html(d.text)
        # Apply topic filter (keyword match against title + description)
        if keyword_filter is not None:
            haystack = f"{title} {description}"
            if not keyword_filter.search(haystack):
                continue
        # Thumbnail
        thumb = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
        if mg is not None:
            t = mg.find("media:thumbnail", ns)
            if t is not None and t.get("url"):
                thumb = t.get("url")
        out.append({
            "id": f"yt-{category}-{video_id}",
            "source": source,
            "category": category,
            "title": title[:200],
            "summary": description[:240],
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "video_id": video_id,
            "thumbnail": thumb,
            "time": pub_dt.astimezone(timezone.utc).isoformat(),
            "kind": "video",
        })
    return out


def build_videos_payload(
    channels: list[tuple[str, str]],
    category: str,
    max_age_minutes: int,
    cache: dict[str, Any],
    keyword_filter: re.Pattern[str] | None = None,
) -> dict[str, Any]:
    now = time.time()
    if cache.get("payload") and now - cache.get("at", 0) < VIDEOS_CACHE_TTL_SECONDS:
        return cache["payload"]

    items: list[dict[str, Any]] = []
    sources: list[str] = []
    errors: list[str] = []

    def grab(channel):
        name, cid = channel
        try:
            vids = fetch_youtube_channel_feed(cid, name, category, max_age_minutes, keyword_filter)
            return name, vids
        except Exception as exc:
            return name, exc

    with ThreadPoolExecutor(max_workers=min(8, len(channels))) as pool:
        futures = {pool.submit(grab, c): c for c in channels}
        for future in as_completed(futures):
            name, result = future.result()
            if isinstance(result, Exception):
                errors.append(f"{name}: {result}")
                continue
            if result:
                items.extend(result)
                if name not in sources:
                    sources.append(name)

    items.sort(key=lambda v: v.get("time") or "", reverse=True)
    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "sources": sources,
        "errors": errors,
        "max_age_minutes": max_age_minutes,
        "items": items[:40],
    }
    cache["at"] = now
    cache["payload"] = payload
    return payload


def strip_html(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def looks_english(text: str) -> bool:
    value = strip_html(text or "")
    if len(value) < 20:
        return False
    if re.search(r"[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0400-\u04ff]", value):
        return False
    letters = re.findall(r"[A-Za-z]", value)
    if len(letters) < 12:
        return False
    non_ascii = sum(1 for ch in value if ord(ch) > 127)
    if non_ascii / max(len(value), 1) > 0.08:
        return False
    common = re.findall(r"\b(the|and|for|with|this|that|from|you|are|new|ai|openai|chatgpt|model|agent|claude)\b", value.lower())
    return bool(common) or len(letters) / max(len(value), 1) > 0.72


def elevenlabs_api_key() -> str:
    env_key = (os.environ.get("ELEVENLABS_API_KEY") or "").strip()
    if env_key:
        return env_key
    if ELEVENLABS_LOCAL_KEY_PATH and os.path.exists(ELEVENLABS_LOCAL_KEY_PATH):
        try:
            raw = open(ELEVENLABS_LOCAL_KEY_PATH, "r", encoding="utf-8").read()
        except OSError:
            return ""
        candidates: list[str] = []
        for line in raw.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if ":" in line:
                line = line.split(":", 1)[1].strip()
            if "=" in line:
                line = line.split("=", 1)[1].strip()
            line = line.strip().strip("`'\"")
            if line.startswith("sk_"):
                candidates.append(line)
        if candidates:
            return candidates[-1]
    return ""


def gemini_api_key() -> str:
    env_key = (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()
    if env_key:
        return env_key
    if GEMINI_LOCAL_KEY_PATH and os.path.exists(GEMINI_LOCAL_KEY_PATH):
        try:
            raw = open(GEMINI_LOCAL_KEY_PATH, "r", encoding="utf-8").read()
        except OSError:
            return ""
        for line in raw.splitlines():
            line = line.strip()
            if not line or line.startswith("#") or line.startswith("---"):
                continue
            if ":" in line:
                line = line.split(":", 1)[1].strip()
            if "=" in line:
                line = line.split("=", 1)[1].strip()
            if len(line) >= 20:
                return line.strip().strip("`'\"")
    return ""


def deepseek_api_key() -> str:
    env_key = (os.environ.get("DEEPSEEK_API_KEY") or "").strip()
    if env_key:
        return env_key
    if DEEPSEEK_LOCAL_KEY_PATH and os.path.exists(DEEPSEEK_LOCAL_KEY_PATH):
        try:
            raw = open(DEEPSEEK_LOCAL_KEY_PATH, "r", encoding="utf-8").read()
        except OSError:
            return ""
        for line in raw.splitlines():
            line = line.strip()
            if not line or line.startswith("#") or line.startswith("---"):
                continue
            if ":" in line:
                line = line.split(":", 1)[1].strip()
            if "=" in line:
                line = line.split("=", 1)[1].strip()
            line = line.strip().strip("`'\"")
            if len(line) >= 20:
                return line
    return ""


def openai_api_key() -> str:
    env_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if env_key:
        return env_key
    if OPENAI_LOCAL_KEY_PATH and os.path.exists(OPENAI_LOCAL_KEY_PATH):
        try:
            raw = open(OPENAI_LOCAL_KEY_PATH, "r", encoding="utf-8").read()
        except OSError:
            return ""
        for line in raw.splitlines():
            line = line.strip()
            if not line or line.startswith("#") or line.startswith("---"):
                continue
            if ":" in line:
                line = line.split(":", 1)[1].strip()
            if "=" in line:
                line = line.split("=", 1)[1].strip()
            line = line.strip().strip("`'\"")
            if line.startswith("sk-"):
                return line
    return ""


JARVIS_SITE_ALIASES = {
    "openai": "https://openai.com/news/",
    "chatgpt": "https://chatgpt.com/",
    "anthropic": "https://www.anthropic.com/news",
    "claude": "https://claude.ai/",
    "hugging face": "https://huggingface.co/models",
    "huggingface": "https://huggingface.co/models",
    "github": "https://github.com/",
    "arxiv": "https://arxiv.org/list/cs.AI/recent",
    "google ai": "https://blog.google/technology/ai/",
    "deepmind": "https://deepmind.google/blog/",
    "perplexity": "https://www.perplexity.ai/",
    "deepseek": "https://api-docs.deepseek.com/",
    "youtube": "https://www.youtube.com/results?search_query=ai+news",
}


def safe_http_url(url: str) -> str:
    value = (url or "").strip()
    if not value:
        return ""
    if not re.match(r"^https?://", value, re.I):
        value = f"https://{value}"
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    return urllib.parse.urlunparse(parsed)


def jarvis_open_action(query: str) -> dict[str, str] | None:
    q = (query or "").lower()
    if not re.search(r"\b(open|launch|pull up|go to|visit|show me)\b", q):
        return None
    for label, url in JARVIS_SITE_ALIASES.items():
        if label in q:
            safe = safe_http_url(url)
            if safe:
                return {"type": "open_url", "url": safe, "title": label}
    match = re.search(
        r"\b(?:open|launch|pull up|go to|visit|show me)\s+((?:https?://)?[a-z0-9.-]+\.[a-z]{2,}(?:/[^\s]*)?)",
        query or "",
        re.I,
    )
    if not match:
        return None
    safe = safe_http_url(match.group(1))
    if not safe:
        return None
    return {"type": "open_url", "url": safe, "title": match.group(1)}


def jarvis_weather_location(query: str) -> str:
    match = re.search(
        r"\b(?:weather|forecast|temperature|temp)\s+(?:in|for|at|near)?\s*([a-zA-Z0-9 .,'-]{2,80})",
        query or "",
        re.I,
    )
    if not match:
        return ""
    location = match.group(1).strip(" .,'-")
    location = re.sub(r"\b(right now|today|current|currently|please|pls)\b", "", location, flags=re.I).strip(" .,'-")
    return location[:80]


def fetch_current_weather(location: str) -> dict[str, Any]:
    loc = clean_context_text(location, 120)
    if not loc:
        raise RuntimeError("Missing weather location")
    state_names = {
        "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
        "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia",
        "HI": "Hawaii", "IA": "Iowa", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana",
        "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "MA": "Massachusetts", "MD": "Maryland",
        "ME": "Maine", "MI": "Michigan", "MN": "Minnesota", "MO": "Missouri", "MS": "Mississippi",
        "MT": "Montana", "NC": "North Carolina", "ND": "North Dakota", "NE": "Nebraska", "NH": "New Hampshire",
        "NJ": "New Jersey", "NM": "New Mexico", "NV": "Nevada", "NY": "New York", "OH": "Ohio",
        "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
        "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VA": "Virginia",
        "VT": "Vermont", "WA": "Washington", "WI": "Wisconsin", "WV": "West Virginia", "WY": "Wyoming",
    }
    state_match = re.search(r"\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b", loc, re.I)
    state_code = state_match.group(1).upper() if state_match else ""
    country_hint = "&countryCode=US" if state_code else ""
    geocode_name = re.sub(r"\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\b", "", loc, flags=re.I).strip(" ,") if country_hint else loc
    geocode_url = (
        "https://geocoding-api.open-meteo.com/v1/search"
        f"?name={urllib.parse.quote(geocode_name or loc)}&count=5&language=en&format=json{country_hint}"
    )
    geo = fetch_json(geocode_url, timeout=10)
    results = geo.get("results") or []
    state_name = state_names.get(state_code, "")
    if state_name:
        result = next((item for item in results if item.get("admin1") == state_name), None)
    else:
        result = None
    result = result or (results or [None])[0]
    if not result:
        raise RuntimeError("Location not found")
    lat = float(result["latitude"])
    lon = float(result["longitude"])
    place = ", ".join(
        part for part in [
            result.get("name"),
            result.get("admin1"),
            result.get("country_code"),
        ]
        if part
    )
    if result.get("country_code") == "US":
        try:
            point = fetch_json(f"https://api.weather.gov/points/{lat:.4f},{lon:.4f}", timeout=10)
            hourly_url = ((point.get("properties") or {}).get("forecastHourly") or "").strip()
            if hourly_url:
                hourly = fetch_json(hourly_url, timeout=10)
                period = (((hourly.get("properties") or {}).get("periods") or [None])[0])
                if period:
                    return {
                        "location": place or loc,
                        "temperature": period.get("temperature"),
                        "temperature_unit": period.get("temperatureUnit") or "F",
                        "feels_like": None,
                        "humidity": ((period.get("relativeHumidity") or {}).get("value")),
                        "precipitation": ((period.get("probabilityOfPrecipitation") or {}).get("value")),
                        "precipitation_unit": "%",
                        "wind_speed": period.get("windSpeed"),
                        "wind_unit": "",
                        "wind_direction": period.get("windDirection"),
                        "condition": period.get("shortForecast"),
                        "time": period.get("startTime"),
                        "provider": "Weather.gov",
                    }
        except Exception:
            pass
    weather_url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,"
        "weather_code,wind_speed_10m,wind_direction_10m"
        "&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto"
    )
    data = fetch_json(weather_url, timeout=10)
    current = data.get("current") or {}
    units = data.get("current_units") or {}
    return {
        "location": place or loc,
        "temperature": current.get("temperature_2m"),
        "temperature_unit": units.get("temperature_2m") or "F",
        "feels_like": current.get("apparent_temperature"),
        "humidity": current.get("relative_humidity_2m"),
        "precipitation": current.get("precipitation"),
        "precipitation_unit": units.get("precipitation") or "in",
        "wind_speed": current.get("wind_speed_10m"),
        "wind_unit": units.get("wind_speed_10m") or "mph",
        "wind_direction": current.get("wind_direction_10m"),
        "condition": weather_text(current.get("weather_code")),
        "time": current.get("time"),
        "provider": "Open-Meteo",
    }


def jarvis_weather_answer(query: str) -> dict[str, Any] | None:
    location = jarvis_weather_location(query)
    if not location:
        return None
    weather = fetch_current_weather(location)
    temp = weather.get("temperature")
    feels = weather.get("feels_like")
    humidity = weather.get("humidity")
    wind = weather.get("wind_speed")
    unit = weather.get("temperature_unit") or "F"
    answer = (
        f"Current weather in {weather['location']}: {weather.get('condition') or 'conditions unavailable'}, "
        f"{round(float(temp)) if temp is not None else 'unknown'}{unit}. "
    )
    if feels is not None:
        answer += f"Feels like {round(float(feels))}{unit}. "
    if wind is not None:
        if isinstance(wind, (int, float)):
            answer += f"Wind {round(float(wind))} {weather.get('wind_unit') or 'mph'}. "
        else:
            answer += f"Wind {clean_context_text(wind, 40)}. "
    if humidity is not None:
        answer += f"Humidity {round(float(humidity))} percent."
    return {
        "answer": answer.strip(),
        "provider": "open-meteo",
        "model": "current-weather",
        "fallback": False,
        "tool": "weather",
        "weather": weather,
    }


def clean_context_text(value: Any, limit: int = 520) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:limit]


def compact_jarvis_context(context: Any) -> dict[str, Any]:
    if not isinstance(context, dict):
        return {}
    compact: dict[str, Any] = {}
    if isinstance(context.get("metrics"), dict):
        compact["metrics"] = {
            clean_context_text(k, 40): clean_context_text(v, 120)
            for k, v in context["metrics"].items()
            if isinstance(k, str) and v is not None
        }
    fields = {
        "news": ("title", "source", "summary", "time", "category", "url"),
        "videos": ("title", "source", "summary", "time", "url"),
        "social": ("text", "author", "network", "time", "url", "score"),
        "research": ("title", "source", "summary", "time", "url", "id"),
        "events": ("title", "source", "summary", "kind", "severity", "time"),
    }
    for key, allowed in fields.items():
        items = context.get(key)
        if not isinstance(items, list):
            continue
        clean_items: list[dict[str, Any]] = []
        for item in items[:8]:
            if not isinstance(item, dict):
                continue
            clean_item: dict[str, Any] = {}
            for field in allowed:
                value = item.get(field)
                if value is None:
                    continue
                if isinstance(value, (int, float)):
                    clean_item[field] = value
                else:
                    clean_item[field] = clean_context_text(value)
            if clean_item:
                clean_items.append(clean_item)
        compact[key] = clean_items
    if isinstance(context.get("stock"), dict):
        stock = context["stock"]
        compact["stock"] = {
            clean_context_text(k, 40): (v if isinstance(v, (int, float)) else clean_context_text(v, 120))
            for k, v in stock.items()
            if isinstance(k, str) and v is not None
        }
    if isinstance(context.get("live_lookup"), dict):
        live = context["live_lookup"]
        compact_live: dict[str, Any] = {}
        if isinstance(live.get("stock"), dict):
            compact_live["stock"] = {
                clean_context_text(k, 40): (v if isinstance(v, (int, float)) else clean_context_text(v, 160))
                for k, v in live["stock"].items()
                if isinstance(k, str) and v is not None and k != "points"
            }
        for key in ("market_news", "news_search"):
            items = live.get(key)
            if not isinstance(items, list):
                continue
            compact_live[key] = [
                {
                    field: clean_context_text(item.get(field), 260)
                    for field in ("title", "source", "summary", "time", "url")
                    if item.get(field)
                }
                for item in items[:6]
                if isinstance(item, dict)
            ]
        if compact_live:
            compact["live_lookup"] = compact_live
    return compact


def jarvis_fallback_answer(query: str, context: Any, action: dict[str, str] | None = None) -> str:
    if action:
        return f"Opening {action.get('title') or 'that site'} inside the desk, sir."
    q = (query or "").lower()
    ctx = compact_jarvis_context(context)
    news = ctx.get("news") or []
    videos = ctx.get("videos") or []
    research = ctx.get("research") or []
    metrics = ctx.get("metrics") or {}
    if re.search(r"\b(status|report|systems?|how('s| is) (it|everything))\b", q):
        stories = metrics.get("stories") or str(len(news))
        sources = metrics.get("sources") or "live"
        videos_count = metrics.get("videos") or str(len(videos))
        return f"DeepSeek is reconnecting, sir. Local systems remain online: {stories} stories, {videos_count} AI videos, and {sources} sources in view."
    if re.search(r"\b(news|headline|latest|happening|brief)\b", q) and news:
        headlines = [clean_context_text(item.get("title"), 160) for item in news[:3] if item.get("title")]
        return f"The latest AI wire, sir: {'; '.join(headlines)}."
    if re.search(r"\b(video|youtube)\b", q) and videos:
        item = videos[0]
        return f"The newest AI video on the desk is {item.get('title')} from {item.get('source')}, sir."
    if re.search(r"\b(research|paper|arxiv|model)\b", q) and research:
        item = research[0]
        return f"The research pulse is led by {item.get('title')}, sir."
    return "DeepSeek is reconnecting, sir. I can still open sites and brief the live dashboard state from local signals."


def fetch_deepseek_jarvis(query: str, context: Any, history: Any = None) -> dict[str, Any]:
    key = deepseek_api_key()
    if not key:
        raise RuntimeError("DeepSeek API key is not configured")
    compact = compact_jarvis_context(context)
    context_json = json.dumps(compact, ensure_ascii=False)[:15000]
    system_prompt = (
        "You are JARVIS for the Matrix AI Intelligence Desk, adapted from the Mark-XL assistant pattern: "
        "speech or text command in, LLM reasoning, dashboard/tool action, concise spoken answer out. "
        "You are a calm, extremely capable UK male intelligence-desk agent. Address the operator as sir occasionally, not every sentence. "
        "Answer the user's actual question first. Use general knowledge when appropriate, and use the provided live dashboard context only when it helps. "
        "Live lookup context, when present, is fresh tool output for current facts, stocks, and news. Use it directly and mention uncertainty when headlines imply causes rather than prove them. "
        "Do not say you can only answer dashboard questions. If live lookup context is present, answer current/worldwide questions from it plus your reasoning. "
        "Keep normal responses under 45 words. Only provide a full desk status when the user explicitly asks for status, report, brief, or rundown. "
        "For website-opening requests, give a brief confirmation; the server will execute the open action separately."
    )
    messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    if isinstance(history, list):
        for item in history[-8:]:
            if not isinstance(item, dict):
                continue
            role = item.get("role")
            content = clean_context_text(item.get("content"), 1200)
            if role in {"user", "assistant"} and content:
                messages.append({"role": role, "content": content})
    messages.append({
        "role": "user",
        "content": (
            f"Operator command: {clean_context_text(query, 1200)}\n\n"
            f"Live desk context JSON:\n{context_json}"
        ),
    })
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": messages,
        "stream": False,
        "temperature": 0.25,
        "max_tokens": 140,
    }
    data = deepseek_chat_completion(payload, key)
    message_payload = ((data.get("choices") or [{}])[0].get("message") or {})
    message = (message_payload.get("content") or message_payload.get("reasoning_content") or "").strip()
    if not message:
        raise RuntimeError("DeepSeek returned an empty response")
    return {
        "answer": message,
        "provider": "deepseek",
        "model": data.get("model") or DEEPSEEK_MODEL,
        "fallback": False,
    }


def deepseek_chat_completion(payload: dict[str, Any], key: str) -> dict[str, Any]:
    url = f"{DEEPSEEK_BASE_URL}/chat/completions"
    body = json.dumps(payload)
    cmd = [
        "curl",
        "-sS",
        "--max-time",
        "28",
        "-w",
        "\nHTTP_STATUS:%{http_code}\n",
        "-X",
        "POST",
        url,
        "-H",
        f"Authorization: Bearer {key}",
        "-H",
        "Content-Type: application/json",
        "-H",
        "Accept: application/json",
        "-H",
        f"User-Agent: {USER_AGENT}",
        "--data",
        body,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=32)
    except (OSError, subprocess.SubprocessError):
        result = None
    if result and result.returncode == 0 and "HTTP_STATUS:" in result.stdout:
        raw, _, status_text = result.stdout.rpartition("\nHTTP_STATUS:")
        status = int((status_text.strip() or "0").splitlines()[0])
        if 200 <= status < 300:
            return json.loads(raw)
        raise RuntimeError(f"DeepSeek HTTP {status}: {clean_context_text(raw, 180)}")

    request = urllib.request.Request(
        url,
        data=body.encode("utf-8"),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=18) as response:
        return json.loads(response.read().decode("utf-8", errors="replace"))


def fetch_elevenlabs_tts(text: str) -> bytes:
    key = elevenlabs_api_key()
    if not key:
        raise RuntimeError("ElevenLabs API key is not configured")
    voice_id = ELEVENLABS_DEFAULT_VOICE_ID.strip() or "JBFqnCBsd6RMkjVDRZzb"
    url = (
        "https://api.elevenlabs.io/v1/text-to-speech/"
        f"{urllib.parse.quote(voice_id)}?output_format=mp3_44100_128"
    )
    payload = {
        "text": text,
        "model_id": ELEVENLABS_MODEL_ID,
        "voice_settings": {
            "stability": 0.58,
            "similarity_boost": 0.86,
            "style": 0.18,
            "use_speaker_boost": True,
            "speed": 0.96,
        },
    }
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "xi-api-key": key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=18) as response:
        audio = response.read()
    if not audio:
        raise RuntimeError("ElevenLabs returned empty audio")
    return audio


def fetch_openai_tts(text: str) -> bytes:
    key = openai_api_key()
    if not key:
        raise RuntimeError("OpenAI API key is not configured")
    payload = {
        "model": OPENAI_TTS_MODEL,
        "voice": OPENAI_TTS_VOICE,
        "input": text[:1200],
        "instructions": "Speak as a calm, precise British male intelligence officer. Concise, warm, and steady.",
        "response_format": "mp3",
    }
    request = urllib.request.Request(
        "https://api.openai.com/v1/audio/speech",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=24) as response:
        audio = response.read()
    if not audio:
        raise RuntimeError("OpenAI TTS returned empty audio")
    return audio


def best_macos_uk_voice() -> str:
    preferred = ("Reed (English (UK))", "Eddy (English (UK))", "Daniel", "Grandpa (English (UK))")
    try:
        result = subprocess.run(["say", "-v", "?"], check=True, capture_output=True, text=True, timeout=4)
        lines = result.stdout.splitlines()
        for voice in preferred:
            if any(line.startswith(voice) for line in lines):
                return voice
        for line in lines:
            if "en_GB" in line:
                return line.split("  ", 1)[0].strip()
    except Exception:
        pass
    return "Daniel"


def fetch_macos_tts(text: str) -> bytes:
    if not shutil.which("say"):
        raise RuntimeError("macOS say command is not available")
    voice = best_macos_uk_voice()
    with tempfile.NamedTemporaryFile(prefix="jarvis-local-", suffix=".m4a", delete=False) as tmp:
        path = tmp.name
    try:
        subprocess.run(
            ["say", "-v", voice, "-o", path, text[:900]],
            check=True,
            capture_output=True,
            timeout=25,
        )
        with open(path, "rb") as handle:
            audio = handle.read()
        if not audio:
            raise RuntimeError("macOS say returned empty audio")
        return audio
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def multipart_form_body(fields: dict[str, str], file_field: str, filename: str, content_type: str, data: bytes) -> tuple[bytes, str]:
    boundary = f"----matrix-elevenlabs-{int(time.time() * 1000)}"
    body = bytearray()
    for name, value in fields.items():
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
        body.extend(str(value).encode("utf-8"))
        body.extend(b"\r\n")
    body.extend(f"--{boundary}\r\n".encode("utf-8"))
    body.extend(
        (
            f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'
            f"Content-Type: {content_type or 'application/octet-stream'}\r\n\r\n"
        ).encode("utf-8")
    )
    body.extend(data)
    body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode("utf-8"))
    return bytes(body), f"multipart/form-data; boundary={boundary}"


def fetch_elevenlabs_stt(audio: bytes, content_type: str = "audio/webm") -> dict:
    key = elevenlabs_api_key()
    if not key:
        raise RuntimeError("ElevenLabs API key is not configured")
    if len(audio) < 600:
        return {"text": ""}
    ext = "webm"
    if "mp4" in content_type:
        ext = "mp4"
    elif "mpeg" in content_type or "mp3" in content_type:
        ext = "mp3"
    fields = {
        "model_id": "scribe_v2",
        "language_code": "en",
        "tag_audio_events": "false",
        "timestamps_granularity": "none",
        "diarize": "false",
        "no_verbatim": "true",
        "file_format": "other",
    }
    body, multipart_type = multipart_form_body(fields, "file", f"jarvis-wake.{ext}", content_type, audio)
    request = urllib.request.Request(
        "https://api.elevenlabs.io/v1/speech-to-text",
        data=body,
        headers={
            "xi-api-key": key,
            "Content-Type": multipart_type,
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=24) as response:
        payload = json.loads(response.read().decode("utf-8"))
    text = (payload.get("text") or "").strip()
    return {
        "text": text,
        "language_code": payload.get("language_code"),
        "language_probability": payload.get("language_probability"),
    }


def fetch_gemini_stt(audio: bytes, content_type: str = "audio/webm") -> dict:
    key = gemini_api_key()
    if not key:
        raise RuntimeError("Gemini API key is not configured")
    if len(audio) < 600:
        return {"text": ""}
    prompt = (
        "Transcribe this short microphone clip for a dashboard wake-command system. "
        "Return only the spoken words. If no clear speech is present, return an empty string. "
        "Important wake words are Jarvis, Otto, and Auto."
    )
    payload = {
        "contents": [{
            "parts": [
                {"text": prompt},
                {
                    "inlineData": {
                        "mimeType": content_type or "application/octet-stream",
                        "data": base64.b64encode(audio).decode("ascii"),
                    }
                },
            ]
        }],
        "generationConfig": {
            "temperature": 0,
            "maxOutputTokens": 64,
        },
    }
    models = []
    for model in (GEMINI_STT_MODEL, "gemini-2.5-flash", "gemini-2.0-flash"):
        if model and model not in models:
            models.append(model)
    last_error: Exception | None = None
    for model in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{urllib.parse.quote(model)}:generateContent"
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "x-goog-api-key": key,
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": USER_AGENT,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=24) as response:
                data = json.loads(response.read().decode("utf-8"))
            parts = (((data.get("candidates") or [{}])[0].get("content") or {}).get("parts") or [])
            text = " ".join((part.get("text") or "") for part in parts).strip().strip('"')
            return {"text": text, "provider": "gemini", "model": model}
        except Exception as exc:
            last_error = exc
    if last_error:
        raise last_error
    raise RuntimeError("Gemini transcription failed")


def fetch_speech_to_text(audio: bytes, content_type: str = "audio/webm") -> dict:
    try:
        payload = fetch_elevenlabs_stt(audio, content_type)
        payload["provider"] = "elevenlabs"
        return payload
    except Exception:
        return fetch_gemini_stt(audio, content_type)


def parse_rss_date(value: str | None) -> str:
    if not value:
        return datetime.now(timezone.utc).isoformat()
    try:
        dt = parsedate_to_datetime(value)
        if dt is None:
            raise ValueError
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except (TypeError, ValueError):
        pass
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except (TypeError, ValueError):
        return datetime.now(timezone.utc).isoformat()


def first_img_src(html_text: str) -> str | None:
    """Pull the first <img src="..."> URL out of an HTML blob (for RSS feeds
    that embed images inside <description> or <content:encoded>)."""
    if not html_text:
        return None
    match = re.search(r"<img[^>]+src=[\"']([^\"']+)[\"']", html_text, re.IGNORECASE)
    return match.group(1) if match else None


def parse_rss(xml_text: str, source: str, category: str, limit: int = 12) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return items
    ns = {
        "atom": "http://www.w3.org/2005/Atom",
        "media": "http://search.yahoo.com/mrss/",
        "content": "http://purl.org/rss/1.0/modules/content/",
        "dc": "http://purl.org/dc/elements/1.1/",
    }
    entries = root.findall(".//item") or root.findall(".//atom:entry", ns)
    for entry in entries[:limit]:
        def grab(tag: str) -> str | None:
            node = entry.find(tag)
            if node is None:
                node = entry.find(f"atom:{tag}", ns)
            if node is None:
                return None
            if tag == "link" and node is not None and not (node.text or "").strip():
                return node.get("href")
            return node.text
        title = strip_html(grab("title") or "")
        link = (grab("link") or "").strip()
        raw_description = grab("description") or grab("summary") or ""
        # content:encoded carries the full article HTML on most major feeds — pull it for image + body
        content_encoded_node = entry.find("content:encoded", ns)
        content_html = content_encoded_node.text if (content_encoded_node is not None and content_encoded_node.text) else ""
        description = strip_html(raw_description)
        # Body = whichever stripped form is longest, capped at 800 chars for card display
        body_candidates = [strip_html(content_html), description]
        body = max(body_candidates, key=len) if body_candidates else ""
        body = body[:800]
        pub = grab("pubDate") or grab("published") or grab("updated")
        creator_node = entry.find("dc:creator", ns)
        author = strip_html(creator_node.text) if creator_node is not None and creator_node.text else None
        # Hunt for a thumbnail: media:thumbnail → media:content → enclosure → first <img> in body
        thumb = None
        for tag in ("media:thumbnail", "media:content"):
            node = entry.find(tag, ns)
            if node is not None and node.get("url"):
                thumb = node.get("url")
                break
        if not thumb:
            enc = entry.find("enclosure")
            if enc is not None:
                t = (enc.get("type") or "").lower()
                if t.startswith("image"):
                    thumb = enc.get("url")
        if not thumb:
            thumb = first_img_src(content_html) or first_img_src(raw_description)
        # Reject obvious tracking pixels / spacers
        if thumb and ("1x1" in thumb or "pixel" in thumb.lower() or thumb.endswith(".gif")):
            thumb = None
        if not title:
            continue
        items.append({
            # STABLE id (md5 of link/title) — NOT Python's hash() which is
            # randomized per process. A randomized id meant every server restart
            # re-assigned ids to the same articles, causing the client to
            # re-announce already-seen breaking news. md5 is deterministic so an
            # article keeps the same id forever and is announced exactly once.
            "id": f"news-{hashlib.md5((link or title).encode('utf-8')).hexdigest()[:16]}",
            "source": source,
            "category": category,
            "title": title[:220],
            "summary": (body or description or "")[:480],
            "url": link,
            "time": parse_rss_date(pub),
            "author": author,
            "thumbnail": thumb,
        })
    return items


def build_news_payload() -> dict[str, Any]:
    now = time.time()
    if news_cache["payload"] and now - news_cache["at"] < NEWS_CACHE_TTL_SECONDS:
        return news_cache["payload"]
    items: list[dict[str, Any]] = []
    sources: list[str] = []
    errors: list[str] = []
    for source, url, category in NEWS_FEEDS:
        try:
            xml_text = fetch_text(url, timeout=10)
            parsed = parse_rss(xml_text, source, category, limit=10)
            if category == "ai":
                kept = [
                    item for item in parsed
                    if AI_NEWS_RE.search(f"{item.get('title','')} {item.get('summary','')}")
                ]
            elif category in ("world", "us"):
                # This desk is AI-only. General world/news feeds are monitored
                # elsewhere and must not leak into the intelligence queue.
                kept = []
            else:
                kept = []  # any other category dropped entirely
            if kept:
                items.extend(kept)
                if source not in sources:
                    sources.append(source)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError,
                ET.ParseError, ValueError, subprocess.CalledProcessError,
                subprocess.TimeoutExpired) as exc:
            errors.append(f"{source}: {exc}")
    items.sort(key=lambda item: item.get("time") or "", reverse=True)
    # AI-only feed (plus a thin emergency safety channel). DEFAULT_CAP 0 means
    # any stray non-ai/non-emergency category is dropped.
    PER_CATEGORY_CAPS = {
        "ai": 80,
        "emergency": 12,
    }
    DEFAULT_CAP = 0
    by_cat: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        cat = item.get("category") or "world"
        by_cat.setdefault(cat, []).append(item)
    selected: list[dict[str, Any]] = []
    for cat, cat_items in by_cat.items():
        cap = PER_CATEGORY_CAPS.get(cat, DEFAULT_CAP)
        selected.extend(cat_items[:cap])
    selected.sort(key=lambda item: item.get("time") or "", reverse=True)
    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "sources": sources,
        "errors": errors,
        "items": selected[:120],
    }
    news_cache["at"] = now
    news_cache["payload"] = payload
    return payload


def build_intel_payload() -> dict[str, Any]:
    now = time.time()
    if intel_cache["payload"] and now - intel_cache["at"] < INTEL_CACHE_TTL_SECONDS:
        return intel_cache["payload"]
    widgets: list[dict[str, Any]] = []
    sources: list[str] = []
    errors: list[str] = []

    try:
        coins = fetch_json(
            "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=6&page=1",
            timeout=8,
        )
        sources.append("CoinGecko")
        widgets.append({
            "id": "intel-crypto",
            "kind": "crypto",
            "title": "Crypto Markets",
            "source": "CoinGecko",
            "items": [
                {
                    "symbol": (coin.get("symbol") or "").upper(),
                    "name": coin.get("name"),
                    "price": coin.get("current_price"),
                    "change": coin.get("price_change_percentage_24h"),
                    "market_cap": coin.get("market_cap"),
                }
                for coin in (coins or [])[:6]
            ],
        })
    except Exception as exc:
        errors.append(f"coingecko: {exc}")

    try:
        fx = fetch_json("https://open.er-api.com/v6/latest/USD", timeout=8)
        sources.append("ExchangeRate-API")
        rates = fx.get("rates") or {}
        widgets.append({
            "id": "intel-fx",
            "kind": "fx",
            "title": "USD FX Rates",
            "source": "ExchangeRate-API",
            "updated": fx.get("time_last_update_utc"),
            "items": [
                {"symbol": code, "rate": rates.get(code)}
                for code in ("EUR", "GBP", "JPY", "CNY", "INR", "AUD")
                if rates.get(code) is not None
            ],
        })
    except Exception as exc:
        errors.append(f"er-api: {exc}")

    try:
        hn_ids = fetch_json("https://hacker-news.firebaseio.com/v0/topstories.json", timeout=6)
        top = []
        for story_id in (hn_ids or [])[:6]:
            try:
                story = fetch_json(
                    f"https://hacker-news.firebaseio.com/v0/item/{story_id}.json",
                    timeout=4,
                )
                if story and story.get("title"):
                    top.append({
                        "id": story.get("id"),
                        "title": story.get("title"),
                        "url": story.get("url") or f"https://news.ycombinator.com/item?id={story.get('id')}",
                        "score": story.get("score"),
                        "by": story.get("by"),
                        "descendants": story.get("descendants"),
                    })
            except Exception:
                continue
        if top:
            sources.append("Hacker News API")
            widgets.append({
                "id": "intel-hn",
                "kind": "hn",
                "title": "Hacker News Top",
                "source": "Hacker News API",
                "items": top,
            })
    except Exception as exc:
        errors.append(f"hn: {exc}")

    try:
        wiki = fetch_json("https://en.wikipedia.org/api/rest_v1/feed/featured/"
                          + datetime.now(timezone.utc).strftime("%Y/%m/%d"),
                          timeout=8)
        sources.append("Wikipedia")
        news_items = []
        for entry in (wiki.get("news") or [])[:5]:
            text = strip_html(entry.get("story") or "")
            link = (entry.get("links") or [{}])[0].get("content_urls", {}).get("desktop", {}).get("page")
            if text:
                news_items.append({"title": text[:180], "url": link})
        if news_items:
            widgets.append({
                "id": "intel-wiki",
                "kind": "wiki",
                "title": "Wikipedia: In the news",
                "source": "Wikipedia",
                "items": news_items,
            })
    except Exception as exc:
        errors.append(f"wikipedia: {exc}")

    try:
        apod = fetch_json("https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY", timeout=8)
        sources.append("NASA APOD")
        widgets.append({
            "id": "intel-apod",
            "kind": "apod",
            "title": "NASA Astronomy Picture",
            "source": "NASA APOD",
            "items": [{
                "title": apod.get("title"),
                "explanation": strip_html(apod.get("explanation") or "")[:260],
                "url": apod.get("hdurl") or apod.get("url"),
                "media_type": apod.get("media_type"),
                "date": apod.get("date"),
            }],
        })
    except Exception as exc:
        errors.append(f"apod: {exc}")

    try:
        spacex = fetch_json("https://api.spacexdata.com/v5/launches/next", timeout=8)
        sources.append("SpaceX API")
        widgets.append({
            "id": "intel-spacex",
            "kind": "spacex",
            "title": "Next SpaceX Launch",
            "source": "SpaceX API",
            "items": [{
                "name": spacex.get("name"),
                "date": spacex.get("date_utc"),
                "details": (spacex.get("details") or "")[:240],
                "rocket": spacex.get("rocket"),
                "links": (spacex.get("links") or {}).get("webcast"),
            }],
        })
    except Exception as exc:
        errors.append(f"spacex: {exc}")

    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "sources": sources,
        "errors": errors,
        "widgets": widgets,
    }
    intel_cache["at"] = now
    intel_cache["payload"] = payload
    return payload


def build_stock_payload() -> dict[str, Any]:
    """Live TSLA quote + intraday 5-minute chart via Yahoo Finance's public
    chart endpoint (free, no key). 60s cache."""
    now = time.time()
    if stock_cache["payload"] and now - stock_cache["at"] < STOCK_CACHE_TTL_SECONDS:
        return stock_cache["payload"]
    url = "https://query1.finance.yahoo.com/v8/finance/chart/TSLA?interval=5m&range=1d"
    try:
        data = json.loads(fetch_text(url, timeout=8))
        result = data["chart"]["result"][0]
        meta = result.get("meta", {})
        timestamps = result.get("timestamp") or []
        closes = (result.get("indicators", {}).get("quote") or [{}])[0].get("close") or []
        points = [
            {"t": t, "c": round(c, 2)}
            for t, c in zip(timestamps, closes)
            if c is not None
        ]
        price = meta.get("regularMarketPrice")
        prev = meta.get("chartPreviousClose") or meta.get("previousClose")
        change = round(price - prev, 2) if price is not None and prev else None
        change_pct = round(change / prev * 100, 2) if change is not None and prev else None
        payload = {
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "symbol": "TSLA",
            "name": meta.get("shortName") or "Tesla, Inc.",
            "price": price,
            "prevClose": prev,
            "change": change,
            "changePct": change_pct,
            "currency": meta.get("currency") or "USD",
            "marketState": meta.get("marketState"),
            "dayHigh": meta.get("regularMarketDayHigh"),
            "dayLow": meta.get("regularMarketDayLow"),
            "points": points[-80:],
        }
    except Exception as exc:
        # Keep serving the last good payload if Yahoo hiccups
        if stock_cache["payload"]:
            return stock_cache["payload"]
        payload = {"updated_at": datetime.now(timezone.utc).isoformat(), "symbol": "TSLA", "error": str(exc), "points": []}
    stock_cache["at"] = now
    stock_cache["payload"] = payload
    return payload


def fetch_stock_news(symbol: str = "TSLA", company: str = "Tesla", limit: int = 6) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    feeds = [
        ("Yahoo Finance", f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={urllib.parse.quote(symbol)}&region=US&lang=en-US"),
        ("Google News", "https://news.google.com/rss/search?"
         f"q={urllib.parse.quote(company + ' stock OR shares')}&hl=en-US&gl=US&ceid=US:en"),
    ]
    for source, url in feeds:
        try:
            parsed = parse_rss(fetch_text(url, timeout=8), source, "market", limit=limit)
        except Exception:
            continue
        for item in parsed:
            title = item.get("title") or ""
            if title and not any(existing.get("title") == title for existing in items):
                items.append(item)
            if len(items) >= limit:
                return items[:limit]
    return items[:limit]


def fetch_live_news_search(query: str, limit: int = 6) -> list[dict[str, Any]]:
    search = clean_context_text(query, 180)
    if not search:
        return []
    url = (
        "https://news.google.com/rss/search?"
        f"q={urllib.parse.quote(search)}&hl=en-US&gl=US&ceid=US:en"
    )
    try:
        return parse_rss(fetch_text(url, timeout=8), "Google News", "live-search", limit=limit)
    except Exception:
        return []


def jarvis_market_symbol(query: str) -> tuple[str, str] | None:
    q = (query or "").lower()
    if re.search(r"\b(tsla|tesla)\b", q):
        return ("TSLA", "Tesla")
    return None


def build_jarvis_live_lookup(query: str) -> dict[str, Any]:
    q = query or ""
    lookup: dict[str, Any] = {}
    market = jarvis_market_symbol(q)
    if market and re.search(r"\b(stock|share|shares|price|market|drop|dropped|down|fall|fell|rally|up|why)\b", q, re.I):
        symbol, company = market
        if symbol == "TSLA":
            lookup["stock"] = build_stock_payload()
        lookup["market_news"] = fetch_stock_news(symbol, company)
    if re.search(r"\b(today|current|currently|latest|recent|now|why|what happened|worldwide|search|look up|news)\b", q, re.I):
        search_query = q
        if market:
            search_query = f"{market[1]} stock why today"
        lookup["news_search"] = fetch_live_news_search(search_query)
    return lookup


def build_social_payload() -> dict[str, Any]:
    """Live AI social pulse from free, key-less networks:
    Mastodon hashtag timelines + Lemmy communities + Hacker News (Algolia,
    by-date). Reddit/Bluesky/X block anonymous server access, so these three
    give the live 'people are posting right now' signal."""
    now = time.time()
    if social_cache["payload"] and now - social_cache["at"] < SOCIAL_CACHE_TTL_SECONDS:
        return social_cache["payload"]
    items: list[dict[str, Any]] = []
    errors: list[str] = []

    # Mastodon — hashtag timelines (multiple AI tags)
    for tag in ("openai", "artificialintelligence", "chatgpt", "llm"):
        try:
            posts = json.loads(fetch_text(f"https://mastodon.social/api/v1/timelines/tag/{tag}?limit=10", timeout=7))
            for p in posts:
                text = strip_html(p.get("content") or "")
                if not looks_english(text):
                    continue
                items.append({
                    "id": f"mast-{p.get('id')}",
                    "network": "mastodon",
                    "author": "@" + (p.get("account", {}).get("acct") or "user"),
                    "text": text[:300],
                    "url": p.get("url") or "",
                    "score": (p.get("favourites_count") or 0) + (p.get("reblogs_count") or 0),
                    "time": p.get("created_at"),
                })
        except Exception as exc:
            errors.append(f"mastodon/{tag}: {exc}")

    # Lemmy — Reddit-style communities
    try:
        data = json.loads(fetch_text("https://lemmy.world/api/v3/post/list?community_name=technology&sort=Hot&limit=15", timeout=8))
        for p in data.get("posts", []):
            post = p.get("post", {})
            counts = p.get("counts", {})
            title = post.get("name") or ""
            blob = f"{title} {post.get('body','')}".lower()
            # Keep AI-relevant tech posts only
            if not re.search(r"\b(ai|artificial intelligence|openai|chatgpt|llm|anthropic|claude|gemini|deepseek|nvidia|robot|model)\b", blob):
                continue
            if not looks_english(title):
                continue
            items.append({
                "id": f"lemmy-{post.get('id')}",
                "network": "lemmy",
                "author": "c/technology",
                "text": title[:300],
                "url": post.get("ap_id") or "",
                "score": counts.get("score") or 0,
                "time": post.get("published"),
            })
    except Exception as exc:
        errors.append(f"lemmy: {exc}")

    # Hacker News — newest AI stories (Algolia)
    try:
        data = json.loads(fetch_text("https://hn.algolia.com/api/v1/search_by_date?query=AI&tags=story&hitsPerPage=15", timeout=8))
        for h in data.get("hits", []):
            title = h.get("title") or ""
            if not looks_english(title):
                continue
            items.append({
                "id": f"hn-{h.get('objectID')}",
                "network": "hn",
                "author": "@" + (h.get("author") or "hn"),
                "text": title[:300],
                "url": h.get("url") or f"https://news.ycombinator.com/item?id={h.get('objectID')}",
                "score": h.get("points") or 0,
                "time": h.get("created_at"),
            })
    except Exception as exc:
        errors.append(f"hn-algolia: {exc}")

    items.sort(key=lambda i: i.get("time") or "", reverse=True)
    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "errors": errors,
        "items": items[:40],
    }
    social_cache["at"] = now
    social_cache["payload"] = payload
    return payload


def build_aipulse_payload() -> dict[str, Any]:
    """The 'crazy density' AI research pulse: latest arXiv cs.AI papers,
    Hugging Face trending models, and fresh-this-week GitHub AI repos."""
    now = time.time()
    if aipulse_cache["payload"] and now - aipulse_cache["at"] < AIPULSE_CACHE_TTL_SECONDS:
        return aipulse_cache["payload"]
    papers: list[dict[str, Any]] = []
    models: list[dict[str, Any]] = []
    repos: list[dict[str, Any]] = []
    errors: list[str] = []

    try:
        xml_text = fetch_text(
            "https://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=8",
            timeout=10,
        )
        root = ET.fromstring(xml_text)
        ns = {"a": "http://www.w3.org/2005/Atom"}
        for e in root.findall("a:entry", ns):
            title = re.sub(r"\s+", " ", (e.findtext("a:title", "", ns) or "")).strip()
            link = e.findtext("a:id", "", ns) or ""
            published = e.findtext("a:published", "", ns) or ""
            authors = [a.findtext("a:name", "", ns) for a in e.findall("a:author", ns)][:3]
            papers.append({"title": title[:160], "url": link, "time": published, "authors": ", ".join(filter(None, authors))})
    except Exception as exc:
        errors.append(f"arxiv: {exc}")

    try:
        data = json.loads(fetch_text("https://huggingface.co/api/models?sort=trendingScore&limit=8", timeout=8))
        for m in data:
            models.append({
                "id": m.get("id"),
                "likes": m.get("likes"),
                "downloads": m.get("downloads"),
                "task": m.get("pipeline_tag") or "",
                "url": f"https://huggingface.co/{m.get('id')}",
            })
    except Exception as exc:
        errors.append(f"huggingface: {exc}")

    try:
        since = (datetime.now(timezone.utc) - timedelta(days=10)).strftime("%Y-%m-%d")
        data = json.loads(fetch_text(
            f"https://api.github.com/search/repositories?q=topic:ai+created:>{since}&sort=stars&order=desc&per_page=6",
            timeout=8,
        ))
        for r in data.get("items", []):
            repos.append({
                "name": r.get("full_name"),
                "stars": r.get("stargazers_count"),
                "desc": (r.get("description") or "")[:120],
                "url": r.get("html_url"),
            })
    except Exception as exc:
        errors.append(f"github: {exc}")

    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "errors": errors,
        "papers": papers,
        "models": models,
        "repos": repos,
    }
    aipulse_cache["at"] = now
    aipulse_cache["payload"] = payload
    return payload


class MatrixHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".json": "application/json",
    }

    def end_headers(self) -> None:
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self) -> None:
        if self.path.startswith("/api/jarvis"):
            try:
                length = int(self.headers.get("Content-Length") or "0")
            except ValueError:
                length = 0
            if length <= 0:
                self.send_error(400, "Missing request body")
                return
            if length > 256 * 1024:
                self.send_error(413, "Request too large")
                return
            try:
                raw = self.rfile.read(length).decode("utf-8", errors="replace")
                data = json.loads(raw)
            except json.JSONDecodeError:
                self.send_error(400, "Invalid JSON")
                return
            if not isinstance(data, dict):
                self.send_error(400, "Invalid request")
                return
            query = clean_context_text(data.get("query"), 1200)
            if not query:
                self.send_error(400, "Missing query")
                return
            context = data.get("context") if isinstance(data.get("context"), dict) else {}
            live_lookup = build_jarvis_live_lookup(query)
            if live_lookup:
                context = {**context, "live_lookup": live_lookup}
                if "stock" in live_lookup and "stock" not in context:
                    context["stock"] = live_lookup["stock"]
            history = data.get("history") if isinstance(data.get("history"), list) else []
            action = jarvis_open_action(query)
            try:
                payload = jarvis_weather_answer(query) or fetch_deepseek_jarvis(query, context, history)
                if action:
                    payload["action"] = action
                    payload["answer"] = f"Opening {action.get('title') or 'that site'} inside the desk, sir."
                payload["deepseek_configured"] = True
            except Exception as exc:
                payload = {
                    "answer": jarvis_fallback_answer(query, context, action),
                    "provider": "local-fallback",
                    "model": "matrix-jarvis-rules",
                    "fallback": True,
                    "action": action,
                    "deepseek_configured": bool(deepseek_api_key()),
                    "error": "deepseek_unavailable",
                    "detail": clean_context_text(str(exc), 240),
                }
            body = json.dumps(payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith("/api/stt"):
            try:
                length = int(self.headers.get("Content-Length") or "0")
            except ValueError:
                length = 0
            if length <= 0:
                self.send_error(400, "Missing audio")
                return
            if length > 8 * 1024 * 1024:
                self.send_error(413, "Audio too large")
                return
            content_type = (self.headers.get("Content-Type") or "application/octet-stream").split(";")[0].strip()
            audio = self.rfile.read(length)
            payload: dict[str, Any] = {"error": "stt_failed", "text": ""}
            status = 502
            for attempt in range(2):
                try:
                    payload = fetch_speech_to_text(audio, content_type)
                    status = 200
                    break
                except Exception:
                    if attempt == 0:
                        time.sleep(0.45)
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_error(404, "Not found")

    def do_GET(self) -> None:
        if self.path.startswith("/api/camera-preview"):
            parsed = urllib.parse.urlparse(self.path)
            camera_id = urllib.parse.parse_qs(parsed.query).get("id", [""])[0]
            camera = next((item for item in CAMERAS if item["id"] == camera_id), None)
            if not camera:
                self.send_error(404, "Camera not found")
                return
            title = html.escape(camera["title"])
            source = html.escape(camera["source"])
            mode = "LIVE STREAM" if camera.get("liveUrl") else "UPDATING STILL"
            safe_mode = html.escape(mode)
            body = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#123f72"/>
<stop offset="0.52" stop-color="#7c245a"/>
<stop offset="1" stop-color="#ff6a1a"/>
</linearGradient>
<radialGradient id="hot" cx="72%" cy="22%" r="58%">
<stop offset="0" stop-color="#ff5fa8" stop-opacity="0.72"/>
<stop offset="1" stop-color="#ff5fa8" stop-opacity="0"/>
</radialGradient>
</defs>
<rect width="640" height="360" rx="24" fill="#07101c"/>
<rect x="8" y="8" width="624" height="344" rx="20" fill="url(#bg)"/>
<rect x="8" y="8" width="624" height="344" rx="20" fill="url(#hot)"/>
<path d="M48 262c68-42 109-18 156-40 71-33 123-116 226-82 59 19 99 75 162 54v118H48z" fill="#06131f" fill-opacity=".56"/>
<g transform="translate(52 54)" fill="none" stroke="#f6f8ff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">
<rect x="0" y="40" width="112" height="76" rx="14"/>
<path d="M112 60l42-25v106l-42-25"/>
<circle cx="52" cy="78" r="20"/>
</g>
<text x="52" y="220" font-family="Inter, Arial, sans-serif" font-size="36" font-weight="800" fill="#f6f8ff">{title}</text>
<text x="52" y="260" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700" fill="#d9e7ff">{source}</text>
<rect x="458" y="42" width="132" height="36" rx="10" fill="#ff4fa3" fill-opacity=".28" stroke="#ffb1d1"/>
<text x="524" y="66" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="900" fill="#ffffff">{safe_mode}</text>
</svg>""".encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "image/svg+xml")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith("/api/events"):
            payload = build_payload()
            body = json.dumps(payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith("/api/satellites"):
            try:
                payload = build_satellite_payload()
                status = 200
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError, ValueError, KeyError, TypeError) as exc:
                payload = {
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "sources": [],
                    "satellites": [],
                    "errors": [str(exc)],
                }
                status = 502
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith("/api/cameras"):
            body = json.dumps({
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "sources": sorted({camera["source"] for camera in CAMERAS}),
                "cameras": CAMERAS,
            }).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith("/api/news"):
            payload = build_news_payload()
            body = json.dumps(payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith("/api/intel"):
            payload = build_intel_payload()
            body = json.dumps(payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith("/api/stock"):
            payload = build_stock_payload()
            body = json.dumps(payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith("/api/social"):
            payload = build_social_payload()
            body = json.dumps(payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith("/api/aipulse"):
            payload = build_aipulse_payload()
            body = json.dumps(payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith("/api/videos/ai"):
            # Topic-filtered to OpenAI/Codex/Claude/Hermes/AI agents/models.
            # 24-hour rolling window so the desk has a visible current-day
            # video watch list instead of hiding slower upload cycles.
            payload = build_videos_payload(
                AI_YT_CHANNELS, "ai-video", 24 * 60, videos_ai_cache,
                keyword_filter=AI_VIDEO_KEYWORDS,
            )
            body = json.dumps(payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith("/api/tts/status"):
            payload = {
                "openai": bool(openai_api_key()),
                "openai_model": OPENAI_TTS_MODEL,
                "openai_voice": OPENAI_TTS_VOICE,
                "elevenlabs": bool(elevenlabs_api_key()),
                "voice": "George",
                "voice_id": ELEVENLABS_DEFAULT_VOICE_ID,
                "model": ELEVENLABS_MODEL_ID,
                "fallback": f"macos-{best_macos_uk_voice()}-local",
                "deepseek": bool(deepseek_api_key()),
                "agent_model": DEEPSEEK_MODEL,
            }
            body = json.dumps(payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith("/api/tts"):
            # Primary: OpenAI TTS when configured, then ElevenLabs, then local UK macOS voice.
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            text = (params.get("text", [""])[0] or "").strip()[:800]
            if not text:
                self.send_error(400, "Missing text")
                return
            provider = (params.get("provider", ["jarvis"])[0] or "jarvis").strip().lower()
            if provider in {"openai", "jarvis"}:
                try:
                    audio = fetch_openai_tts(text)
                    self.send_response(200)
                    self.send_header("Content-Type", "audio/mpeg")
                    self.send_header("Cache-Control", "public, max-age=300")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("X-TTS-Provider", "openai")
                    self.send_header("X-TTS-Voice", OPENAI_TTS_VOICE)
                    self.send_header("Content-Length", str(len(audio)))
                    self.end_headers()
                    self.wfile.write(audio)
                    return
                except Exception:
                    if provider == "openai":
                        self.send_error(502, "OpenAI TTS failed")
                        return
            if provider in {"eleven", "elevenlabs", "jarvis"}:
                try:
                    audio = fetch_elevenlabs_tts(text)
                    self.send_response(200)
                    self.send_header("Content-Type", "audio/mpeg")
                    self.send_header("Cache-Control", "public, max-age=300")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.send_header("X-TTS-Provider", "elevenlabs")
                    self.send_header("X-TTS-Voice", "George")
                    self.send_header("Content-Length", str(len(audio)))
                    self.end_headers()
                    self.wfile.write(audio)
                    return
                except Exception:
                    try:
                        audio = fetch_macos_tts(text)
                        voice = best_macos_uk_voice()
                        self.send_response(200)
                        self.send_header("Content-Type", "audio/mp4")
                        self.send_header("Cache-Control", "no-store")
                        self.send_header("Access-Control-Allow-Origin", "*")
                        self.send_header("X-TTS-Provider", "macos-say")
                        self.send_header("X-TTS-Voice", voice)
                        self.send_header("Content-Length", str(len(audio)))
                        self.end_headers()
                        self.wfile.write(audio)
                        return
                    except Exception:
                        self.send_error(502, "Jarvis TTS failed")
                        return
            tld = (params.get("lang", ["en-GB"])[0] or "en-GB").strip()
            if tld not in {"en-GB", "en-US", "en-AU", "en-IN"}:
                tld = "en-GB"

            # Split text into chunks of ~190 chars at sentence/word boundaries
            def chunk(t, limit=190):
                parts: list[str] = []
                buf = ""
                for piece in re.split(r"(?<=[.!?,;:])\s+", t):
                    if not piece:
                        continue
                    if len(buf) + len(piece) + 1 <= limit:
                        buf = (buf + " " + piece).strip()
                    else:
                        if buf:
                            parts.append(buf)
                        if len(piece) > limit:
                            # Hard split a long word-less piece
                            while piece:
                                parts.append(piece[:limit])
                                piece = piece[limit:]
                            buf = ""
                        else:
                            buf = piece
                if buf:
                    parts.append(buf)
                return parts

            chunks = chunk(text)
            audio_parts: list[bytes] = []
            try:
                for c in chunks:
                    url = (
                        "https://translate.google.com/translate_tts"
                        f"?ie=UTF-8&tl={urllib.parse.quote(tld)}&client=tw-ob"
                        f"&q={urllib.parse.quote(c)}"
                    )
                    result = subprocess.run(
                        [
                            "curl", "-fsSL", "--max-time", "8",
                            "-A", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                            "-H", "Referer: https://translate.google.com/",
                            "-H", "Accept: audio/mpeg, audio/*, */*",
                            url,
                        ],
                        check=True,
                        capture_output=True,
                        timeout=10,
                    )
                    if result.stdout:
                        audio_parts.append(result.stdout)
            except Exception as exc:
                self.send_error(502, f"TTS fetch failed: {exc}")
                return
            audio = b"".join(audio_parts)
            if not audio:
                self.send_error(502, "TTS returned empty audio")
                return
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Cache-Control", "public, max-age=300")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("X-TTS-Provider", "google-translate")
            self.send_header("Content-Length", str(len(audio)))
            self.end_headers()
            self.wfile.write(audio)
            return
        if self.path.startswith("/api/videos/gaming"):
            # Path of Exile 2 only. 24-hour upstream window (was 12h) — strict POE2
            # filter still gets plenty of fresh material from the dedicated creators.
            payload = build_videos_payload(
                GAMING_YT_CHANNELS, "gaming-video", 24 * 60, videos_gaming_cache,
                keyword_filter=GAMING_VIDEO_KEYWORDS,
            )
            body = json.dumps(payload).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


def main() -> None:
    server = ThreadingHTTPServer(("0.0.0.0", PORT), MatrixHandler)
    print(f"Matrix AI Intelligence serving on http://0.0.0.0:{PORT}/", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
