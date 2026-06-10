import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { twoline2satrec } from "./vendor/satellite.js/io.js";
import { propagate, gstime } from "./vendor/satellite.js/propagation.js";
import { eciToGeodetic, degreesLat, degreesLong } from "./vendor/satellite.js/transforms.js";

const layers = [
  { id: "earthquake", label: "Seismic", detail: "USGS · EMSC · GeoNet", color: 0xff3d4f },
  { id: "disaster", label: "Disasters", detail: "GDACS · NHC", color: 0xff9f1c },
  { id: "natural", label: "Natural Events", detail: "EONET · Volcanoes · Fires", color: 0xff4fa3 },
  { id: "space-weather", label: "Space Weather", detail: "NOAA SWPC", color: 0xb56cff },
  { id: "weather", label: "Weather Alerts", detail: "NWS · Open-Meteo", color: 0x48a6ff },
  { id: "aircraft", label: "Live Aircraft", detail: "OpenSky · ADSB.lol", color: 0xf6f8ff },
  { id: "satellite", label: "Satellites", detail: "CelesTrak · ISS", color: 0xff7a1a },
  { id: "camera", label: "Live Cameras", detail: "EarthCam · Skyline", color: 0x43e8d8 },
  { id: "air-quality", label: "Air Quality", detail: "Open-Meteo AQ", color: 0xff4fa3 },
  { id: "ocean", label: "Ocean / Marine", detail: "NOAA CO-OPS · Marine", color: 0x48a6ff },
];

const state = {
  baseEvents: [],
  satelliteTles: [],
  satelliteEvents: [],
  cameras: [],
  events: [],
  news: [],
  intel: [],
  // Cameras-only by default — every other source layer starts OFF.
  // Persisted so a user's toggle choices survive reloads.
  activeLayers: (() => {
    try {
      const saved = JSON.parse(localStorage.getItem("matrix.activeLayers") || "null");
      if (Array.isArray(saved) && saved.length) return new Set(saved);
    } catch (_) {}
    return new Set(["camera"]);
  })(),
  newsScrollMs: (() => {
    const v = parseInt(localStorage.getItem("matrix.newsScrollMs") || "30000", 10);
    return Number.isFinite(v) && v >= 3000 && v <= 60000 ? v : 30000;
  })(),
  markers: new Map(),
  markerObjects: [],
  selectedId: null,
  soundEnabled: true,   // ON by default — first user gesture will unlock the AudioContext
  audio: null,
  audioUnlocked: false,
  voiceEnabled: localStorage.getItem("matrix.voiceEnabled") === "1",
  voicePreferred: null,
  autoRotate: true,
  mode: "live",
  launchTime: Date.now(),
  popupArmedAt: Date.now() + 60000,
  freshAlertWindowMs: 5 * 60 * 1000,
  seenEventIds: new Set(),
  // playedNewsIds: every news id ever announced OR present at first load.
  // Persisted to localStorage so an article is announced EXACTLY ONCE, ever —
  // surviving page reloads and server restarts. Loaded at boot (see below).
  playedNewsIds: new Set(),
  // announcedNewsIds: subset that actually got the breaking popup → these cards
  // show a "✓ ANNOUNCED" badge. Also persisted.
  announcedNewsIds: new Set(),
  freshNewsIds: new Set(),
  breakingTimer: null,
  newsBootstrapped: false,
  hoveredEventId: null,
  pendingNews: [], // items waiting to be promoted to the rail (one is on screen as BREAKING)
  rawNews: [],      // full server-fetched list, used to compose visible state.news
  stock: null,      // live TSLA quote + intraday points
  social: [],       // social pulse posts (mastodon/lemmy/hn-live)
  seenSocialIds: new Set(),
  aipulse: null,    // arXiv papers + HF models + GitHub repos
  camFocus: null,   // globe camera dolly state (in/hold/out)
  aiVideos: [],     // YouTube AI clips posted in the last hour
  gamingVideos: [], // YouTube gaming clips posted in the last 2 hours
  seenVideoIds: new Set(),
  freshVideoIds: new Set(),
  railPage: 1,      // 1 = news + AI videos, 2 = gaming videos
};

const els = {
  globe: document.querySelector("#globe"),
  layerControls: document.querySelector("#layerControls"),
  allLayersButton: document.querySelector("#allLayersButton"),
  noneLayersButton: document.querySelector("#noneLayersButton"),
  sourcesButton: document.querySelector("#sourcesButton"),
  sourcesPopover: document.querySelector("#sourcesPopover"),
  speedSlider: document.querySelector("#speedSlider"),
  speedVal: document.querySelector("#speedVal"),
  speedSlower: document.querySelector("#speedSlower"),
  speedFaster: document.querySelector("#speedFaster"),
  alertFeed: document.querySelector("#alertFeed"),
  eventPopup: document.querySelector("#eventPopup"),
  activeCount: document.querySelector("#activeCount"),
  sourceCount: document.querySelector("#sourceCount"),
  lastUpdated: document.querySelector("#lastUpdated"),
  visibleCount: document.querySelector("#visibleCount"),
  feedState: document.querySelector("#feedState"),
  soundToggle: document.querySelector("#soundToggle"),
  refreshButton: document.querySelector("#refreshButton"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
  autoRotateButton: document.querySelector("#autoRotateButton"),
  commandTabs: document.querySelectorAll(".command-tabs button[data-mode]"),
  detailPanel: document.querySelector("#detailPanel"),
  cameraGrid: document.querySelector("#cameraGrid"),
  cameraCount: document.querySelector("#cameraCount"),
  aircraftTelemetry: document.querySelector("#aircraftTelemetry"),
  satelliteTelemetry: document.querySelector("#satelliteTelemetry"),
  cameraTelemetry: document.querySelector("#cameraTelemetry"),
  weatherTelemetry: document.querySelector("#weatherTelemetry"),
  seismicTelemetry: document.querySelector("#seismicTelemetry"),
  newsTelemetry: document.querySelector("#newsTelemetry"),
  selectedTelemetry: document.querySelector("#selectedTelemetry"),
  modeTelemetry: document.querySelector("#modeTelemetry"),
  newsTrack: document.querySelector("#newsTrack"),
  newsMeta: document.querySelector("#newsMeta"),
  railTitle: document.querySelector("#railTitle"),
  railTabs: document.querySelectorAll(".rail-tab"),
  cryptoBarTrack: document.querySelector("#cryptoBarTrack"),
  hnTickerTrack: document.querySelector("#hnTickerTrack"),
  webView: document.querySelector("#webView"),
  webViewFrame: document.querySelector("#webViewFrame"),
  webViewSource: document.querySelector("#webViewSource"),
  webViewTitle: document.querySelector("#webViewTitle"),
  webViewExternal: document.querySelector("#webViewExternal"),
  webViewClose: document.querySelector("#webViewClose"),
  webViewFallback: document.querySelector("#webViewFallback"),
  voiceToggle: document.querySelector("#voiceToggle"),
  intelPanel: document.querySelector("#intelPanel"),
  intelMeta: document.querySelector("#intelMeta"),
  globeClock: document.querySelector("#globeClock"),
  hudSourceCount: document.querySelector("#hudSourceCount"),
  brandSub: document.querySelector("#brandSub"),
  breakingPopup: document.querySelector("#breakingPopup"),
  mapTooltip: document.querySelector("#mapTooltip"),
  // New live-desk elements
  activityLog: document.querySelector("#activityLog"),
  activityMeta: document.querySelector("#activityMeta"),
  heroStory: document.querySelector("#heroStory"),
  nowHeadline: document.querySelector("#nowHeadline"),
  nowTag: document.querySelector("#nowTag"),
  headerClock: document.querySelector("#headerClock"),
  mStories: document.querySelector("#mStories"),
  mAi: document.querySelector("#mAi"),
  mSources: document.querySelector("#mSources"),
  headlineTickerTrack: document.querySelector("#headlineTickerTrack"),
  // Tesla card
  tslaPrice: document.querySelector("#tslaPrice"),
  tslaChange: document.querySelector("#tslaChange"),
  tslaChart: document.querySelector("#tslaChart"),
  tslaState: document.querySelector("#tslaState"),
  tslaLow: document.querySelector("#tslaLow"),
  tslaHigh: document.querySelector("#tslaHigh"),
  // Social pulse
  socialStrip: document.querySelector("#socialStrip"),
  socialMeta: document.querySelector("#socialMeta"),
  // Story slide-in
  webViewStory: document.querySelector("#webViewStory"),
  // JARVIS
  jarvisOrb: document.querySelector("#jarvisOrb"),
  jarvisPanel: document.querySelector("#jarvisPanel"),
  jarvisClose: document.querySelector("#jarvisClose"),
  jarvisLog: document.querySelector("#jarvisLog"),
  jarvisForm: document.querySelector("#jarvisForm"),
  jarvisInput: document.querySelector("#jarvisInput"),
  jarvisMic: document.querySelector("#jarvisMic"),
};

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x070a12, 6.5, 14);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 0.5, 5.8);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
els.globe.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 2.75;
controls.maxDistance = 9;
controls.rotateSpeed = 0.55;

const globeGroup = new THREE.Group();
const markerGroup = new THREE.Group();
const newsFlagGroup = new THREE.Group(); // transient AI-news flagpole markers
scene.add(globeGroup, markerGroup, newsFlagGroup);
const newsFlags = []; // { group, until, dispose }
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const iconTextures = new Map();
const labelTextures = new Map();

const ambient = new THREE.AmbientLight(0x9cc8ff, 1.3);
const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
keyLight.position.set(-3, 2, 4);
const rimLight = new THREE.DirectionalLight(0x43e8d8, 1.45);
rimLight.position.set(4, -1, -3);
scene.add(ambient, keyLight, rimLight);

function projectionPoint(lon, lat, width, height) {
  return [
    ((lon + 180) / 360) * width,
    ((90 - lat) / 180) * height,
  ];
}

function forEachRingCoordinates(geometry, callback) {
  if (!geometry) return;
  if (geometry.type === "Polygon") {
    geometry.coordinates.forEach(callback);
  } else if (geometry.type === "MultiPolygon") {
    geometry.coordinates.forEach((polygon) => polygon.forEach(callback));
  }
}

function drawRing(ctx, ring, width, height) {
  let started = false;
  let previousX = null;
  for (const coord of ring) {
    const [lon, lat] = coord;
    const [x, y] = projectionPoint(lon, lat, width, height);
    if (!started || (previousX !== null && Math.abs(x - previousX) > width * 0.46)) {
      if (started) ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
    previousX = x;
  }
  if (started) ctx.stroke();
}

function geometryLabelPoint(geometry) {
  const points = [];
  forEachRingCoordinates(geometry, (ring) => {
    ring.forEach(([lon, lat]) => {
      if (Number.isFinite(lon) && Number.isFinite(lat)) points.push([lon, lat]);
    });
  });
  if (!points.length) return null;
  const minLon = Math.min(...points.map((p) => p[0]));
  const maxLon = Math.max(...points.map((p) => p[0]));
  const minLat = Math.min(...points.map((p) => p[1]));
  const maxLat = Math.max(...points.map((p) => p[1]));
  return {
    lon: (minLon + maxLon) / 2,
    lat: (minLat + maxLat) / 2,
    span: Math.max(maxLon - minLon, maxLat - minLat),
  };
}

// Curated "illustrated map" land palette — varied warm/cool greens, teals and
// sandy tones, picked per-country by a stable hash so the globe looks colorful
// and hand-drawn rather than a flat single green.
const LAND_PALETTE = [
  "#3fa36b", "#4cae7a", "#2f9d77", "#5bb98c", "#6fc295",
  "#7fb86a", "#9ac56e", "#caa75a", "#d8b863", "#bfa24f",
  "#3c9a8f", "#48ad9c", "#5ec0ad", "#7a9e57", "#a7c36b",
  "#c98f52", "#b9794a", "#8fb46a", "#62b07f", "#7cc0a0",
];

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function makeGlobeTexture(countries = null) {
  const canvas = document.createElement("canvas");
  canvas.width = 4096;
  canvas.height = 2048;
  const ctx = canvas.getContext("2d");

  // Rich illustrated ocean — deep navy at the poles, brighter teal-blue at the
  // equator, for a vibrant "painted map" feel.
  const ocean = ctx.createLinearGradient(0, 0, 0, canvas.height);
  ocean.addColorStop(0.0, "#0a2c4a");
  ocean.addColorStop(0.30, "#11457a");
  ocean.addColorStop(0.50, "#1763a8");
  ocean.addColorStop(0.70, "#11457a");
  ocean.addColorStop(1.0, "#0a2c4a");
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle ocean sparkle / depth speckles
  ctx.fillStyle = "rgba(150, 205, 235, 0.05)";
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    ctx.beginPath();
    ctx.arc(x, y, Math.random() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Faint lat/long grid
  ctx.strokeStyle = "rgba(170, 210, 235, 0.07)";
  ctx.lineWidth = 1.2;
  for (let x = 0; x <= canvas.width; x += canvas.width / 36) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += canvas.height / 24) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  if (countries?.features?.length) {
    // Soft drop-shadow under each landmass for an illustrated "lifted" look
    countries.features.forEach((feature) => {
      const name = feature.properties?.name || "";
      const baseColor = LAND_PALETTE[hashString(name) % LAND_PALETTE.length];

      // Shadow pass
      ctx.save();
      ctx.shadowColor = "rgba(2, 12, 22, 0.5)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = baseColor;
      forEachRingCoordinates(feature.geometry, (ring) => {
        ctx.beginPath();
        ring.forEach(([lon, lat], index) => {
          const [x, y] = projectionPoint(lon, lat, canvas.width, canvas.height);
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill();
      });
      ctx.restore();
    });

    // Bright coastline stroke
    ctx.strokeStyle = "rgba(235, 250, 245, 0.5)";
    ctx.lineWidth = 1.6;
    countries.features.forEach((feature) => {
      forEachRingCoordinates(feature.geometry, (ring) => drawRing(ctx, ring, canvas.width, canvas.height));
    });

    // Soft terrain texture: scatter lighter/darker dabs ONLY over land by
    // clipping to each country path
    countries.features.forEach((feature) => {
      const name = feature.properties?.name || "";
      const point = geometryLabelPoint(feature.geometry);
      if (!point) return;
      ctx.save();
      ctx.beginPath();
      forEachRingCoordinates(feature.geometry, (ring) => {
        ring.forEach(([lon, lat], index) => {
          const [x, y] = projectionPoint(lon, lat, canvas.width, canvas.height);
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
      });
      ctx.clip();
      const [cx, cy] = projectionPoint(point.lon, point.lat, canvas.width, canvas.height);
      const spread = Math.max(40, point.span * 22);
      const dabs = Math.min(140, Math.max(20, Math.floor(point.span * 6)));
      for (let i = 0; i < dabs; i++) {
        const dx = cx + (Math.random() - 0.5) * spread * 2;
        const dy = cy + (Math.random() - 0.5) * spread;
        const light = Math.random() > 0.5;
        ctx.fillStyle = light ? "rgba(255, 255, 240, 0.10)" : "rgba(20, 50, 35, 0.12)";
        ctx.beginPath();
        ctx.arc(dx, dy, 4 + Math.random() * 10, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

    // Country labels (only larger countries)
    ctx.font = "700 24px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(250, 255, 252, 0.85)";
    ctx.strokeStyle = "rgba(4, 14, 20, 0.78)";
    ctx.lineWidth = 4.5;
    countries.features.forEach((feature) => {
      const point = geometryLabelPoint(feature.geometry);
      const name = feature.properties?.name;
      if (!point || !name || point.span < 9) return;
      const [x, y] = projectionPoint(point.lon, point.lat, canvas.width, canvas.height);
      ctx.strokeText(name, x, y);
      ctx.fillText(name, x, y);
    });
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const earth = new THREE.Mesh(
  new THREE.SphereGeometry(2, 128, 128),
  new THREE.MeshStandardMaterial({
    map: makeGlobeTexture(),
    // Use the map itself as emissive so the colorful land stays visible on the
    // night side too — the globe reads as a solid, illustrated sphere.
    emissiveMap: null,
    roughness: 0.92,
    metalness: 0.04,
    emissive: new THREE.Color(0x0b2138),
    emissiveIntensity: 0.32,
  }),
);
globeGroup.add(earth);

async function loadCountryTexture() {
  try {
    const response = await fetch(`countries.geojson?ts=${Date.now()}`);
    if (!response.ok) throw new Error("country geometry unavailable");
    const countries = await response.json();
    const tex = makeGlobeTexture(countries);
    earth.material.map = tex;
    // Same texture as a dim emissive map so the illustrated land stays readable
    // on the shadowed hemisphere — keeps the sphere feeling solid + colorful.
    earth.material.emissiveMap = tex;
    earth.material.emissive = new THREE.Color(0xffffff);
    earth.material.emissiveIntensity = 0.22;
    earth.material.needsUpdate = true;
  } catch (error) {
    console.warn(error.message);
  }
}

const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(2.06, 96, 96),
  new THREE.MeshBasicMaterial({ color: 0x5ab0ff, transparent: true, opacity: 0.10, side: THREE.BackSide }),
);
globeGroup.add(atmosphere);

function addStarField() {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  for (let i = 0; i < 1400; i++) {
    const radius = 8 + Math.random() * 9;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions.push(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta),
    );
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const stars = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: 0xbddcf4, size: 0.018, transparent: true, opacity: 0.72 }),
  );
  scene.add(stars);
}
addStarField();

function latLngToVector3(lat, lon, radius = 2.08) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/* === AI news geocoding + flagpole markers ===
 * News items carry no coordinates, so we geocode by scanning the headline +
 * summary against a gazetteer of AI orgs and major world places. AI items with
 * no match default to the San Francisco Bay Area (the AI hub). When a new item
 * arrives we plant a flagpole with a banner showing the headline at that spot
 * for 30 seconds, then remove it. */
const NEWS_GAZETTEER = [
  // AI orgs / labs -> HQ
  ["openai", [37.7749, -122.4194]], ["anthropic", [37.7749, -122.4194]],
  ["claude", [37.7749, -122.4194]], ["chatgpt", [37.7749, -122.4194]],
  ["google deepmind", [51.5336, -0.1276]], ["deepmind", [51.5336, -0.1276]],
  ["google", [37.422, -122.084]], ["gemini", [37.422, -122.084]],
  ["microsoft", [47.6396, -122.1283]], ["copilot", [47.6396, -122.1283]],
  ["meta", [37.4847, -122.1477]], ["llama", [37.4847, -122.1477]],
  ["nvidia", [37.3708, -121.9648]], ["apple", [37.3349, -122.009]],
  ["amazon", [47.6062, -122.3321]], ["aws", [47.6062, -122.3321]],
  ["xai", [37.7749, -122.4194]], ["grok", [37.7749, -122.4194]],
  ["tesla", [30.2226, -97.6189]], ["mistral", [48.8566, 2.3522]],
  ["hugging face", [40.7128, -74.006]], ["perplexity", [37.7749, -122.4194]],
  ["deepseek", [30.2741, 120.1551]], ["alibaba", [30.2741, 120.1551]],
  ["qwen", [30.2741, 120.1551]], ["tencent", [22.5431, 114.0579]],
  ["baidu", [39.9042, 116.4074]], ["bytedance", [39.9042, 116.4074]],
  ["samsung", [37.5665, 126.978]], ["tsmc", [24.7736, 120.9938]],
  ["softbank", [35.6762, 139.6503]], ["ibm", [41.1076, -73.7202]],
  ["intel", [37.3879, -121.9648]], ["amd", [37.3879, -121.9648]],
  ["oracle", [30.2226, -97.6189]], ["salesforce", [37.7897, -122.3972]],
  // Major world places (for emergency items + place mentions in AI news)
  ["san francisco", [37.7749, -122.4194]], ["silicon valley", [37.3875, -122.0575]],
  ["new york", [40.7128, -74.006]], ["washington", [38.9072, -77.0369]],
  ["london", [51.5074, -0.1278]], ["paris", [48.8566, 2.3522]],
  ["berlin", [52.52, 13.405]], ["brussels", [50.8503, 4.3517]],
  ["tokyo", [35.6762, 139.6503]], ["beijing", [39.9042, 116.4074]],
  ["shanghai", [31.2304, 121.4737]], ["hong kong", [22.3193, 114.1694]],
  ["seoul", [37.5665, 126.978]], ["singapore", [1.3521, 103.8198]],
  ["new delhi", [28.6139, 77.209]], ["delhi", [28.6139, 77.209]],
  ["mumbai", [19.076, 72.8777]], ["bangalore", [12.9716, 77.5946]],
  ["dubai", [25.2048, 55.2708]], ["tel aviv", [32.0853, 34.7818]],
  ["moscow", [55.7558, 37.6173]], ["kyiv", [50.4501, 30.5234]],
  ["taiwan", [23.6978, 120.9605]], ["taipei", [25.033, 121.5654]],
  ["toronto", [43.6532, -79.3832]], ["sydney", [-33.8688, 151.2093]],
  ["sao paulo", [-23.5558, -46.6396]], ["mexico city", [19.4326, -99.1332]],
  ["united states", [39.8283, -98.5795]], ["china", [35.8617, 104.1954]],
  ["india", [20.5937, 78.9629]], ["japan", [36.2048, 138.2529]],
  ["europe", [50.1109, 8.6821]], ["germany", [51.1657, 10.4515]],
  ["france", [46.6034, 1.8883]], ["united kingdom", [55.3781, -3.436]],
  [" uk ", [55.3781, -3.436]], ["israel", [31.0461, 34.8516]],
  ["ukraine", [48.3794, 31.1656]], ["russia", [61.524, 105.3188]],
  ["gaza", [31.5, 34.467]], ["korea", [37.5665, 126.978]],
  ["california", [36.7783, -119.4179]], ["texas", [31.9686, -99.9018]],
  ["austin", [30.2672, -97.7431]], ["seattle", [47.6062, -122.3321]],
  ["boston", [42.3601, -71.0589]],
];

const AI_HUB_DEFAULT = [37.7749, -122.4194]; // SF Bay Area

function geocodeNews(item, isEmergency) {
  const blob = `${item.title || ""} ${item.summary || ""} ${item.source || ""}`.toLowerCase();
  let best = null;
  let bestLen = 0;
  for (const [key, coord] of NEWS_GAZETTEER) {
    if (blob.includes(key) && key.length > bestLen) {
      best = coord;
      bestLen = key.length;
    }
  }
  if (best) return best;
  // No place found: AI items default to the AI hub; emergency items get skipped
  return isEmergency ? null : AI_HUB_DEFAULT;
}

const flagBannerTextures = new Map();

function makeFlagBannerTexture(item, isEmergency) {
  const key = `${isEmergency ? "E" : "A"}:${item.id}`;
  if (flagBannerTextures.has(key)) return flagBannerTextures.get(key);
  const w = 512, h = 220;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  const accent = isEmergency ? "#ff3d4f" : "#43e8d8";
  const accent2 = isEmergency ? "#ff7a1a" : "#48a6ff";
  // Banner background
  ctx.fillStyle = "rgba(7, 12, 22, 0.96)";
  ctx.strokeStyle = accent;
  ctx.lineWidth = 5;
  roundRect(ctx, 6, 6, w - 12, h - 12, 16);
  ctx.fill();
  ctx.stroke();
  // Left accent bar
  ctx.fillStyle = accent;
  roundRect(ctx, 6, 6, 12, h - 12, 6);
  ctx.fill();
  // Tag
  ctx.fillStyle = accent;
  ctx.font = "800 22px 'JetBrains Mono', monospace";
  ctx.textBaseline = "top";
  ctx.fillText(isEmergency ? "● EMERGENCY" : "● AI NEWS", 34, 22);
  // Source (right aligned)
  ctx.fillStyle = "rgba(180, 200, 230, 0.8)";
  ctx.font = "700 18px 'JetBrains Mono', monospace";
  ctx.textAlign = "right";
  ctx.fillText((item.source || "").toUpperCase().slice(0, 22), w - 28, 24);
  ctx.textAlign = "left";
  // Headline — word-wrapped, up to 4 lines
  ctx.fillStyle = "#f2f6ff";
  ctx.font = "700 26px Inter, Arial, sans-serif";
  const words = (item.title || "").split(/\s+/);
  const maxWidth = w - 60;
  let line = "", y = 64;
  let lines = 0;
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, 30, y);
      line = word; y += 34; lines += 1;
      if (lines >= 3) break;
    } else {
      line = test;
    }
  }
  if (lines < 4 && line) ctx.fillText(line.length > 40 ? line.slice(0, 38) + "…" : line, 30, y);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  flagBannerTextures.set(key, texture);
  return texture;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const MAX_NEWS_FLAGS = 6;
const NEWS_FLAG_TTL_MS = 30000;

function dropNewsFlag(item, isEmergency = false) {
  const coord = geocodeNews(item, isEmergency);
  if (!coord) return;
  const [lat, lon] = coord;
  const surface = latLngToVector3(lat, lon, 2.0);
  const outward = surface.clone().normalize();

  const group = new THREE.Group();
  group.position.copy(surface);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);

  const accent = isEmergency ? 0xff3d4f : 0x43e8d8;
  const poleLen = 0.34;
  // Pole
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.008, poleLen, 8),
    new THREE.MeshBasicMaterial({ color: 0xeaf2ff, depthTest: true }),
  );
  pole.position.y = poleLen / 2;
  pole.material.userData.baseOpacity = 1.0;
  group.add(pole);
  // Base bead at the surface (pulses)
  const bead = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 14, 14),
    new THREE.MeshBasicMaterial({ color: accent, depthTest: true }),
  );
  bead.material.userData.baseOpacity = 1.0;
  group.add(bead);
  // Tall glowing beacon beam so the flag is spottable from a distance / an angle
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, 0.9, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: accent, transparent: true, opacity: 0.32,
      depthTest: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  beacon.position.y = 0.45;
  beacon.material.userData.baseOpacity = 0.32;
  group.add(beacon);
  // Banner sprite at the top of the pole (billboards toward camera)
  const banner = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeFlagBannerTexture(item, isEmergency),
      transparent: true,
      depthTest: true,
      depthWrite: false,
    }),
  );
  banner.scale.set(0.56, 0.24, 1);
  banner.position.set(0.30, poleLen - 0.01, 0); // beside the pole top like a flag
  group.add(banner);

  newsFlagGroup.add(group);
  const entry = {
    group, bead,
    until: performance.now() + NEWS_FLAG_TTL_MS,
    raisedAt: performance.now(),
    dispose() {
      newsFlagGroup.remove(group);
      pole.geometry.dispose(); pole.material.dispose();
      bead.geometry.dispose(); bead.material.dispose();
      beacon.geometry.dispose(); beacon.material.dispose();
      banner.material.dispose();
    },
  };
  newsFlags.push(entry);
  // Cap concurrent flags — drop the oldest
  while (newsFlags.length > MAX_NEWS_FLAGS) {
    const old = newsFlags.shift();
    old.dispose();
  }
  // Spin the globe so the new flag faces the viewer — the whole point is that
  // the operator SEES it arrive.
  focusGlobeOnLatLon(lat, lon);
  if (typeof addActivity === "function") addActivity("flag", `Map pin · ${lat.toFixed(1)}, ${lon.toFixed(1)} · ${item.source || ""}`);
}

// Rotate the globe so a given lat/lon faces the camera AND dolly the camera
// in close (so the user can actually see WHERE the news is), hold, then pull
// back out. Auto-rotation pauses while focused.
const GLOBE_HOME_DIST = 5.8;
const GLOBE_ZOOM_DIST = 2.85;   // close enough that country shapes/labels read
const GLOBE_ZOOM_HOLD_MS = 9000;

function focusGlobeOnLatLon(lat, lon) {
  const P = latLngToVector3(lat, lon, 2.0);
  const camAz = Math.atan2(camera.position.x, camera.position.z);
  const beta = Math.atan2(P.x, P.z);
  state.rotFocus = {
    target: camAz - beta,
    animating: true,
    resumeAutoAt: performance.now() + GLOBE_ZOOM_HOLD_MS + 3500,
  };
  // Camera dolly: in → hold → out
  state.camFocus = {
    phase: "in",
    holdUntil: 0,
  };
}

function colorForLayer(layerId) {
  return layers.find((layer) => layer.id === layerId)?.color ?? 0x43e8d8;
}

function eventIconKey(event) {
  const details = event.details ?? {};
  const text = `${event.title ?? ""} ${event.summary ?? ""} ${details.Category ?? ""} ${details["Event type"] ?? ""}`.toLowerCase();
  if (event.layer === "camera") return event.liveUrl ? "camera-live" : "camera-still";
  if (event.layer === "weather") {
    if (/snow|blizzard|ice|freeze/.test(text)) return "weather-snow";
    if (/flood|rain|shower/.test(text)) return "weather-rain";
    if (/wind|gale|hurricane|tornado/.test(text)) return "weather-wind";
    if (/thunder|storm|lightning/.test(text)) return "weather-storm";
    if (/fire|red flag/.test(text)) return "natural-fire";
    return "weather-general";
  }
  if (event.layer === "disaster") {
    if (/flood|\bfl\b/.test(text)) return "disaster-flood";
    if (/drought|\bdr\b/.test(text)) return "disaster-drought";
    if (/cyclone|hurricane|typhoon|tropical|\btc\b/.test(text)) return "disaster-cyclone";
    if (/volcano|\bvo\b/.test(text)) return "natural-volcano";
    if (/earthquake|\beq\b/.test(text)) return "earthquake";
    return "disaster-general";
  }
  if (event.layer === "natural") {
    if (/wildfire|fire/.test(text)) return "natural-fire";
    if (/volcano|volcanic/.test(text)) return "natural-volcano";
    if (/ice|snow/.test(text)) return "natural-ice";
    if (/storm|cyclone|hurricane/.test(text)) return "weather-storm";
    return "natural-general";
  }
  return event.layer;
}

/* === Polished icon set === */
function hexCss(value) {
  return `#${value.toString(16).padStart(6, "0")}`;
}

function drawHaloDisk(ctx, color, radius = 50, alpha = 0.18) {
  const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, radius);
  gradient.addColorStop(0, withAlpha(color, alpha + 0.05));
  gradient.addColorStop(0.6, withAlpha(color, alpha));
  gradient.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(64, 64, radius, 0, Math.PI * 2);
  ctx.fill();
}

function withAlpha(color, alpha) {
  const c = color.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawLayerIcon(ctx, iconKey, color) {
  ctx.clearRect(0, 0, 128, 128);
  drawHaloDisk(ctx, color, 52, 0.18);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  if (iconKey === "aircraft") {
    // Sleek airplane glyph (top-down)
    ctx.save();
    ctx.translate(64, 64);
    ctx.rotate(-Math.PI / 4);
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, -38);
    ctx.lineTo(7, -16);
    ctx.lineTo(40, -2);
    ctx.lineTo(40, 8);
    ctx.lineTo(7, 2);
    ctx.lineTo(5, 30);
    ctx.lineTo(14, 38);
    ctx.lineTo(14, 44);
    ctx.lineTo(0, 40);
    ctx.lineTo(-14, 44);
    ctx.lineTo(-14, 38);
    ctx.lineTo(-5, 30);
    ctx.lineTo(-7, 2);
    ctx.lineTo(-40, 8);
    ctx.lineTo(-40, -2);
    ctx.lineTo(-7, -16);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return;
  }

  if (iconKey === "earthquake") {
    // Concentric pulse + center bolt
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.lineWidth = 3;
    [22, 34, 46].forEach((r, i) => {
      ctx.globalAlpha = 1 - i * 0.28;
      ctx.beginPath();
      ctx.arc(64, 64, r, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(64, 64, 6, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (iconKey === "satellite") {
    ctx.shadowColor = color;
    ctx.shadowBlur = 5;
    ctx.lineWidth = 3.5;
    ctx.save();
    ctx.translate(64, 64);
    ctx.rotate(Math.PI / 6);
    // Body
    ctx.fillRect(-7, -10, 14, 20);
    // Solar panels
    ctx.strokeRect(-32, -8, 18, 16);
    ctx.strokeRect(14, -8, 18, 16);
    // Antenna
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(0, -22);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -26, 4, 0, Math.PI * 2);
    ctx.fill();
    // Orbit ring
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, 40, Math.PI * 0.2, Math.PI * 1.8);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (iconKey === "camera-live" || iconKey === "camera-still") {
    ctx.shadowColor = color;
    ctx.shadowBlur = 7;
    // Camera body
    ctx.beginPath();
    ctx.roundRect(28, 40, 56, 40, 6);
    ctx.fill();
    // Lens cone
    ctx.beginPath();
    ctx.moveTo(84, 52);
    ctx.lineTo(102, 42);
    ctx.lineTo(102, 78);
    ctx.lineTo(84, 68);
    ctx.closePath();
    ctx.fill();
    // Lens
    ctx.fillStyle = "rgba(8, 14, 22, 0.95)";
    ctx.beginPath();
    ctx.arc(54, 60, 10, 0, Math.PI * 2);
    ctx.fill();
    // Recording dot for live
    if (iconKey === "camera-live") {
      ctx.fillStyle = "#ff3d4f";
      ctx.shadowColor = "#ff3d4f";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(74, 50, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  if (iconKey === "weather-storm" || iconKey === "weather-general") {
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    // Cloud
    ctx.beginPath();
    ctx.arc(48, 60, 16, Math.PI, 0);
    ctx.arc(66, 54, 20, Math.PI, 0);
    ctx.arc(84, 62, 14, Math.PI, 0);
    ctx.lineTo(84, 76);
    ctx.lineTo(48, 76);
    ctx.closePath();
    ctx.fill();
    if (iconKey === "weather-storm") {
      // Lightning bolt
      ctx.fillStyle = "#ffd86b";
      ctx.shadowColor = "#ffd86b";
      ctx.beginPath();
      ctx.moveTo(60, 78);
      ctx.lineTo(52, 102);
      ctx.lineTo(64, 96);
      ctx.lineTo(58, 116);
      ctx.lineTo(76, 90);
      ctx.lineTo(64, 92);
      ctx.lineTo(72, 78);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }

  if (iconKey === "weather-rain") {
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(48, 56, 16, Math.PI, 0);
    ctx.arc(66, 50, 20, Math.PI, 0);
    ctx.arc(84, 58, 14, Math.PI, 0);
    ctx.lineTo(84, 72);
    ctx.lineTo(48, 72);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 3;
    for (const x of [50, 66, 82]) {
      ctx.beginPath();
      ctx.moveTo(x, 80);
      ctx.lineTo(x - 4, 100);
      ctx.stroke();
    }
    return;
  }

  if (iconKey === "weather-snow") {
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(48, 56, 16, Math.PI, 0);
    ctx.arc(66, 50, 20, Math.PI, 0);
    ctx.arc(84, 58, 14, Math.PI, 0);
    ctx.lineTo(84, 72);
    ctx.lineTo(48, 72);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 2.5;
    for (const [x, y] of [[52, 92], [66, 102], [82, 92]]) {
      for (let i = 0; i < 3; i++) {
        const a = (Math.PI * i) / 3;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(a) * 6, y - Math.sin(a) * 6);
        ctx.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6);
        ctx.stroke();
      }
    }
    return;
  }

  if (iconKey === "weather-wind" || iconKey === "air-quality") {
    ctx.shadowColor = color;
    ctx.shadowBlur = 5;
    ctx.lineWidth = 4;
    for (const y of [44, 64, 84]) {
      ctx.beginPath();
      ctx.moveTo(24, y);
      ctx.bezierCurveTo(46, y - 14, 78, y + 14, 104, y - 4);
      ctx.stroke();
    }
    if (iconKey === "air-quality") {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(36, 98, 4, 0, Math.PI * 2);
      ctx.arc(64, 105, 4, 0, Math.PI * 2);
      ctx.arc(92, 96, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  if (iconKey === "ocean" || iconKey === "disaster-flood") {
    ctx.shadowColor = color;
    ctx.shadowBlur = 5;
    ctx.lineWidth = 4;
    for (const y of [50, 68, 84]) {
      ctx.beginPath();
      ctx.moveTo(24, y);
      ctx.bezierCurveTo(40, y - 12, 52, y + 12, 64, y);
      ctx.bezierCurveTo(78, y - 12, 90, y + 12, 104, y);
      ctx.stroke();
    }
    if (iconKey === "disaster-flood") {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(64, 22);
      ctx.lineTo(96, 44);
      ctx.lineTo(32, 44);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }

  if (iconKey === "natural-fire") {
    ctx.shadowColor = "#ff5a1f";
    ctx.shadowBlur = 12;
    const grd = ctx.createLinearGradient(64, 30, 64, 100);
    grd.addColorStop(0, "#ffe27a");
    grd.addColorStop(0.5, "#ff8a1a");
    grd.addColorStop(1, "#ff3d4f");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(62, 104);
    ctx.bezierCurveTo(34, 88, 44, 60, 62, 42);
    ctx.bezierCurveTo(64, 64, 88, 62, 80, 30);
    ctx.bezierCurveTo(106, 58, 104, 90, 62, 104);
    ctx.closePath();
    ctx.fill();
    return;
  }

  if (iconKey === "natural-volcano") {
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    // Mountain
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(22, 100);
    ctx.lineTo(52, 52);
    ctx.lineTo(76, 52);
    ctx.lineTo(106, 100);
    ctx.closePath();
    ctx.fill();
    // Crater + lava
    const lava = ctx.createLinearGradient(64, 28, 64, 60);
    lava.addColorStop(0, "#ffd86b");
    lava.addColorStop(1, "#ff3d4f");
    ctx.fillStyle = lava;
    ctx.beginPath();
    ctx.moveTo(52, 52);
    ctx.lineTo(60, 30);
    ctx.lineTo(66, 40);
    ctx.lineTo(72, 24);
    ctx.lineTo(76, 52);
    ctx.closePath();
    ctx.fill();
    return;
  }

  if (iconKey === "natural-ice") {
    ctx.shadowColor = color;
    ctx.shadowBlur = 7;
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6;
      const dx = Math.cos(a), dy = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(64, 64);
      ctx.lineTo(64 + dx * 38, 64 + dy * 38);
      ctx.stroke();
      // Branchlets
      ctx.beginPath();
      ctx.moveTo(64 + dx * 22, 64 + dy * 22);
      ctx.lineTo(64 + dx * 22 + (-dy) * 8, 64 + dy * 22 + dx * 8);
      ctx.moveTo(64 + dx * 22, 64 + dy * 22);
      ctx.lineTo(64 + dx * 22 - (-dy) * 8, 64 + dy * 22 - dx * 8);
      ctx.stroke();
    }
    return;
  }

  if (iconKey === "disaster-drought") {
    ctx.shadowColor = "#f8c35b";
    ctx.shadowBlur = 8;
    // Sun
    ctx.fillStyle = "#f8c35b";
    ctx.beginPath();
    ctx.arc(64, 42, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#f8c35b";
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      ctx.beginPath();
      ctx.moveTo(64 + Math.cos(a) * 22, 42 + Math.sin(a) * 22);
      ctx.lineTo(64 + Math.cos(a) * 30, 42 + Math.sin(a) * 30);
      ctx.stroke();
    }
    // Cracked ground
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(28, 92);
    ctx.lineTo(50, 84);
    ctx.lineTo(62, 100);
    ctx.lineTo(78, 84);
    ctx.lineTo(100, 92);
    ctx.stroke();
    return;
  }

  if (iconKey === "disaster-cyclone") {
    ctx.shadowColor = color;
    ctx.shadowBlur = 9;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(64, 64, 38, 0.3, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(64, 64, 22, Math.PI * 1.3, Math.PI * 0.5);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(64, 64, 5, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (iconKey === "space-weather") {
    ctx.shadowColor = "#ffe27a";
    ctx.shadowBlur = 12;
    const grd = ctx.createRadialGradient(64, 64, 6, 64, 64, 30);
    grd.addColorStop(0, "#ffe27a");
    grd.addColorStop(1, "#ff5a1f");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(64, 64, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffe27a";
    ctx.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12;
      ctx.beginPath();
      ctx.moveTo(64 + Math.cos(a) * 30, 64 + Math.sin(a) * 30);
      ctx.lineTo(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44);
      ctx.stroke();
    }
    return;
  }

  // Generic disaster / natural triangle
  ctx.shadowColor = color;
  ctx.shadowBlur = 7;
  ctx.beginPath();
  ctx.moveTo(64, 24);
  ctx.lineTo(108, 98);
  ctx.lineTo(20, 98);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(8, 14, 22, 0.95)";
  ctx.fillRect(60, 46, 8, 30);
  ctx.fillRect(60, 82, 8, 8);
}

function iconTexture(iconKey, layerId = iconKey) {
  if (iconTextures.has(iconKey)) return iconTextures.get(iconKey);
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const color = hexCss(colorForLayer(layerId));
  drawLayerIcon(ctx, iconKey, color);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  iconTextures.set(iconKey, texture);
  return texture;
}

/* === Aircraft callsign labels === */
function callsignLabelTexture(text) {
  const key = `label:${text}`;
  if (labelTextures.has(key)) return labelTextures.get(key);
  const width = 256;
  const height = 64;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.font = "800 32px 'JetBrains Mono', 'SF Mono', Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Background pill
  const padX = 10;
  const metric = ctx.measureText(text);
  const w = Math.min(width - 8, Math.ceil(metric.width) + padX * 2);
  const x = (width - w) / 2;
  const y = (height - 38) / 2;
  ctx.fillStyle = "rgba(6, 12, 22, 0.78)";
  ctx.strokeStyle = "rgba(67, 232, 216, 0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, 38, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#eafcff";
  ctx.shadowColor = "rgba(67, 232, 216, 0.55)";
  ctx.shadowBlur = 6;
  ctx.fillText(text, width / 2, height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  labelTextures.set(key, texture);
  return texture;
}

function severityClass(severity) {
  if (severity === "high") return "high";
  if (severity === "medium") return "medium";
  return "low";
}

function formatTime(iso) {
  if (!iso) return "Live";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Live";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(date);
}

function relativeTime(iso) {
  if (!iso) return "now";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "now";
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

function eventTimestamp(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isAutoPopupCandidate(event, now = Date.now()) {
  if (!event || ["aircraft", "satellite", "camera"].includes(event.layer)) return false;
  const timestamp = eventTimestamp(event.time);
  if (timestamp && now - timestamp > state.freshAlertWindowMs) return false;
  return event.severity !== "low" || ["earthquake", "weather", "disaster", "natural", "space-weather"].includes(event.layer);
}

function eventMetric(event) {
  const details = event.details ?? {};
  if (event.layer === "aircraft") return details.Altitude || "Aircraft";
  if (event.layer === "earthquake") return details.Magnitude ? `M ${details.Magnitude}` : "Seismic";
  if (event.layer === "weather") return details.Temperature || details.Severity || "Weather";
  if (event.layer === "air-quality") return details["US AQI"] ? `AQI ${details["US AQI"]}` : "Air quality";
  if (event.layer === "ocean") return details["Wave height"] || details["Water level"] || "Ocean";
  if (event.layer === "satellite") return details.Altitude || "Satellite";
  if (event.layer === "camera") return event.liveUrl ? "Live stream" : "Updating still";
  if (event.layer === "disaster") return details["Alert level"] || "Alert";
  return event.severity.toUpperCase();
}

function renderDetailPanel(event) {
  if (!event) {
    els.detailPanel.classList.add("hidden");
    els.detailPanel.innerHTML = "";
    return;
  }
  const details = Object.entries(event.details ?? {}).filter(([, value]) => value !== null && value !== undefined && value !== "");
  const imageSource = event.imageUrl ? `${event.imageUrl}?ts=${Date.now()}` : event.thumbnailUrl;
  const image = imageSource ? `<img src="${imageSource}" alt="${event.title} preview" loading="lazy">` : "";
  const liveLink = event.liveUrl ? `<a class="live-open" href="${event.liveUrl}" target="_blank" rel="noreferrer">Open live stream</a>` : "";
  els.detailPanel.innerHTML = `
    <div class="detail-head">
      <span class="type-chip">${event.layer.replace("-", " ")}</span>
      <h2>${event.title}</h2>
      <p>${event.summary}</p>
    </div>
    ${image}
    ${liveLink}
    <div class="detail-grid">
      <div><span>Source</span><strong>${event.source}</strong></div>
      <div><span>Time</span><strong>${formatTime(event.time)}</strong></div>
      <div><span>Coords</span><strong>${event.lat.toFixed(2)}, ${event.lon.toFixed(2)}</strong></div>
    </div>
    <div class="detail-list">
      ${details.slice(0, 8).map(([key, value]) => `<div><span>${key}</span><strong>${value}</strong></div>`).join("")}
    </div>
  `;
  els.detailPanel.classList.remove("hidden");
}

function createMarker(event) {
  const group = new THREE.Group();
  const radius = event.layer === "satellite" ? 2.55 : event.layer === "aircraft" ? 2.22 : 2.08;
  const basePosition = latLngToVector3(event.lat, event.lon, radius);
  group.position.copy(basePosition);
  group.lookAt(0, 0, 0);
  const iconKey = eventIconKey(event);

  const icon = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: iconTexture(iconKey, event.layer),
      transparent: true,
      depthTest: true,    // respect the opaque globe → back-side markers are hidden
      depthWrite: false,  // but don't occlude each other harshly
    }),
  );
  // Base screen-space size. SMALLER than before, and held CONSTANT on screen
  // regardless of zoom by the per-frame distance correction in animate().
  const iconSize = event.layer === "aircraft" ? 0.040 : event.layer === "satellite" ? 0.038 : event.layer === "camera" ? 0.044 : 0.046;
  icon.scale.set(iconSize, iconSize, 1);
  icon.userData.eventId = event.id;
  group.add(icon);

  if (event.layer === "aircraft") {
    const callsign = (event.details?.Callsign || event.title || "").toString().replace(/\s+/g, " ").trim().slice(0, 12).toUpperCase();
    if (callsign && callsign !== "UNKNOWN FLIGHT") {
      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: callsignLabelTexture(callsign),
          transparent: true,
          depthTest: true,
          depthWrite: false,
        }),
      );
      label.scale.set(0.072, 0.018, 1);
      label.position.set(0, -0.038, 0);
      label.userData.eventId = event.id;
      group.add(label);
    }
  }

  group.userData = { event, marker: icon, baseScale: event.severity === "high" ? 1.18 : 1 };
  markerGroup.add(group);
  state.markers.set(event.id, group);
  state.markerObjects.push(icon);
}

function syncMarkers() {
  for (const marker of state.markers.values()) {
    markerGroup.remove(marker);
  }
  state.markers.clear();
  state.markerObjects = [];

  state.events
    .filter((event) => state.activeLayers.has(event.layer))
    .forEach(createMarker);
}

function visibleEvents() {
  const events = state.events.filter((event) => state.activeLayers.has(event.layer));
  if (state.mode === "timeline") {
    return [...events].sort((a, b) => eventTimestamp(b.time) - eventTimestamp(a.time));
  }
  return events;
}

function renderLayers() {
  const counts = Object.fromEntries(layers.map((layer) => [layer.id, 0]));
  for (const event of state.events) {
    if (counts[event.layer] !== undefined) counts[event.layer] += 1;
  }

  els.layerControls.innerHTML = layers.map((layer) => `
    <label class="layer-toggle">
      <input type="checkbox" data-layer="${layer.id}" ${state.activeLayers.has(layer.id) ? "checked" : ""}>
      <span>
        <strong>${layer.label}</strong>
        <small>${layer.detail}</small>
      </span>
      <em class="layer-count">${counts[layer.id] ?? 0}</em>
    </label>
  `).join("");

  els.layerControls.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) state.activeLayers.add(input.dataset.layer);
      else state.activeLayers.delete(input.dataset.layer);
      persistLayers();
      renderAll();
    });
  });
}

function persistLayers() {
  try {
    localStorage.setItem("matrix.activeLayers", JSON.stringify([...state.activeLayers]));
  } catch (_) {}
}

/* === Camera grid: render all 5 live simultaneously ===
 * IMPORTANT: only rewrite the iframe HTML when the camera list actually
 * changes. The cameras are essentially static (5 hardcoded Bay Area feeds);
 * blindly re-rendering on every 60-second loadEvents refresh would destroy
 * and recreate the YouTube iframes, causing the videos to reload — visible
 * to the user as a flicker every refresh cycle. */
let renderedCameraSignature = "";

function renderCameras() {
  const liveCameras = state.cameras.filter((c) => c.embedUrl).slice(0, 5);
  els.cameraCount.textContent = `${liveCameras.length} live`;
  if (!liveCameras.length) {
    if (renderedCameraSignature !== "empty") {
      els.cameraGrid.innerHTML = `<div class="camera-empty">No camera feed loaded.</div>`;
      renderedCameraSignature = "empty";
    }
    return;
  }

  // Build a stable signature from the camera identities. If it matches what we
  // already have on screen, skip the rewrite entirely — the iframes keep playing
  // their existing video streams uninterrupted.
  const signature = liveCameras.map((c) => `${c.id}:${c.embedUrl}`).join("|");
  if (signature === renderedCameraSignature) return;
  renderedCameraSignature = signature;
  addActivity("camera", `${liveCameras.length} live cameras online`);

  els.cameraGrid.innerHTML = liveCameras.map((cam, index) => {
    const isFeatured = index === 0;
    return `
      <div class="camera-tile ${isFeatured ? "featured" : ""}" data-camera-id="camera-${cam.id}">
        <iframe
          src="${cam.embedUrl}"
          title="${cam.title}"
          allow="autoplay; encrypted-media; picture-in-picture"
          referrerpolicy="strict-origin-when-cross-origin"
          loading="eager"
          frameborder="0"></iframe>
        <div class="tile-overlay">
          <div class="tile-overlay-top">
            <span class="cam-num">${String(index + 1).padStart(2, "0")}</span>
            <span class="live-pill ${cam.liveUrl ? "" : "still"}">${cam.liveUrl ? "LIVE" : "STILL"}</span>
          </div>
          <div class="tile-overlay-bottom">
            <strong>${cam.title}</strong>
            <small>${cam.source}</small>
          </div>
        </div>
      </div>
    `;
  }).join("");

  els.cameraGrid.querySelectorAll(".camera-tile").forEach((tile) => {
    tile.addEventListener("click", (e) => {
      if (e.target.tagName === "IFRAME") return;
      selectEvent(tile.dataset.cameraId, true);
    });
  });
}

/* === Alerts feed === */
function renderFeed() {
  const events = visibleEvents();
  els.activeCount.textContent = events.length;
  els.visibleCount.textContent = `${events.length} live`;

  if (!events.length) {
    els.alertFeed.innerHTML = `<article class="alert-card"><div class="alert-title"><span class="mini-icon">!</span><h2>No active layers</h2></div><p>Switch layers on or hit All.</p></article>`;
    return;
  }

  // Prioritize non-aircraft events for the alerts feed (planes belong on the globe)
  const sorted = [...events].sort((a, b) => {
    const weight = (e) => {
      const severityScore = { high: 3, medium: 2, low: 1 }[e.severity] ?? 1;
      const layerWeight = e.layer === "aircraft" ? -100 : e.layer === "camera" ? -50 : 0;
      return severityScore + layerWeight;
    };
    return weight(b) - weight(a) || eventTimestamp(b.time) - eventTimestamp(a.time);
  });

  els.alertFeed.innerHTML = sorted.slice(0, 24).map((event) => `
    <article class="alert-card ${event.id === state.selectedId ? "active" : ""}" data-event-id="${event.id}">
      <div class="alert-title">
        <span class="mini-icon">${eventGlyph(event)}</span>
        <h2>${event.title}</h2>
        <span class="severity-chip ${severityClass(event.severity)}">${event.severity.toUpperCase()}</span>
      </div>
      <p>${event.summary}</p>
      <div class="alert-meta">
        <span class="tag">${event.source}</span>
        <span class="tag">${eventMetric(event)}</span>
        <span class="tag">${relativeTime(event.time)}</span>
      </div>
    </article>
  `).join("");

  els.alertFeed.querySelectorAll(".alert-card[data-event-id]").forEach((card) => {
    card.addEventListener("click", () => selectEvent(card.dataset.eventId, true));
  });
}

/* === News rail (paged) ===
 * PAGE 1: news stories + YouTube AI videos from the last hour
 * PAGE 2: YouTube gaming videos from the last 2 hours
 * Cards on both pages are sorted newest-first so the leftmost slot
 * always has the freshest content. */
function escAttr(s) { return (s || "").replace(/"/g, "&quot;"); }

function videoCardHtml(item, freshSet) {
  const isNew = freshSet && freshSet.has(item.id) ? "is-new" : "";
  const thumb = item.thumbnail || `https://i.ytimg.com/vi/${item.video_id}/hqdefault.jpg`;
  const embedUrl = item.video_id ? `https://www.youtube.com/embed/${item.video_id}?autoplay=1` : (item.url || "");
  return `
    <a class="news-card video-card cat-ai-video ${isNew}" data-news-card="true" data-url="${item.url || ""}" data-embed="${embedUrl}" data-source="${escAttr(item.source)}" data-title="${escAttr(item.title)}" href="${item.url || "#"}" target="_blank" rel="noreferrer">
      <div class="news-card-thumb"><img src="${thumb}" alt="" loading="lazy"></div>
      <div class="news-card-body">
        <div class="news-card-meta"><span>▶ ${item.source}</span><span class="news-time">${relativeTime(item.time)}</span></div>
        <h3>${item.title}</h3>
        <p>${item.summary || ""}</p>
      </div>
    </a>
  `;
}

function newsCardHtml(item) {
  const isNew = state.freshNewsIds.has(item.id) ? "is-new" : "";
  const noImage = item.thumbnail ? "" : "no-image";
  const thumb = item.thumbnail
    ? `<div class="news-card-thumb"><img src="${item.thumbnail}" alt="" loading="lazy" onerror="this.closest('.news-card').classList.add('no-image'); this.parentNode.remove();"></div>`
    : "";
  const announced = state.announcedNewsIds.has(item.id)
    ? `<span class="news-played" title="Announced — won't repeat">✓</span>`
    : "";
  return `
    <a class="news-card cat-${item.category || "world"} ${noImage} ${isNew}" data-news-card="true" data-url="${item.url || ""}" data-source="${escAttr(item.source)}" data-title="${escAttr(item.title)}" href="${item.url || "#"}" target="_blank" rel="noreferrer">
      ${thumb}
      <div class="news-card-body">
        <div class="news-card-meta">
          <span>${item.source}</span>
          <span class="news-time">${announced}${relativeTime(item.time)}</span>
        </div>
        <h3>${item.title}</h3>
        <p>${item.summary || ""}</p>
      </div>
    </a>
  `;
}

/* === Hero (featured top story) === */
function renderHero(item) {
  if (!els.heroStory) return;
  if (!item) { els.heroStory.classList.add("hidden"); return; }
  const isVideo = !!item._isVideo;
  const img = item.thumbnail || (item.video_id ? `https://i.ytimg.com/vi/${item.video_id}/hqdefault.jpg` : "");
  const isEmergency = item.category === "emergency";
  const badge = isEmergency
    ? `<span class="hero-badge">● EMERGENCY</span>`
    : `<span class="hero-badge ai">● ${isVideo ? "AI VIDEO" : "AI BREAKING"}</span>`;
  const embedUrl = isVideo && item.video_id ? `https://www.youtube.com/embed/${item.video_id}?autoplay=1` : "";
  els.heroStory.classList.remove("hidden");
  els.heroStory.href = item.url || "#";
  els.heroStory.dataset.newsCard = "true";
  els.heroStory.dataset.url = item.url || "";
  els.heroStory.dataset.embed = embedUrl;
  els.heroStory.dataset.source = item.source || "";
  els.heroStory.dataset.title = item.title || "";
  // Videos play INLINE in the hero card (click-to-play YouTube embed);
  // articles get the cinematic image treatment.
  const media = isVideo && item.video_id
    ? `<div class="hero-video"><iframe src="https://www.youtube.com/embed/${item.video_id}?rel=0" title="${escAttr(item.title)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
    : (img ? `<div class="hero-img" style="background-image:url('${img}')"></div><div class="hero-shade"></div>` : `<div class="hero-shade"></div>`);
  els.heroStory.classList.toggle("hero--video", isVideo);
  els.heroStory.innerHTML = `
    ${media}
    <div class="hero-body">
      <div class="hero-row">${badge}<span class="hero-src">${item.source || ""}</span><span class="hero-time">${relativeTime(item.time)} ago</span></div>
      <h2>${item.title || ""}</h2>
      ${isVideo ? "" : `<p>${item.summary || ""}</p>`}
    </div>`;
}

/* === Bottom headline ticker === */
function renderHeadlineTicker(items) {
  if (!els.headlineTickerTrack) return;
  const top = items.slice(0, 18);
  if (!top.length) return;
  const html = top.map((i) => `<span class="ticker-item"><b>${(i.source || "").toUpperCase()}</b>${i.title}</span>`).join("");
  els.headlineTickerTrack.innerHTML = html + html; // duplicate for seamless loop
}

const CARD_MAX_AGE_MS = 2 * 60 * 60 * 1000;       // news: 2-hour rail TTL
const VIDEO_MAX_AGE_MS = 6 * 60 * 60 * 1000;      // videos: 6-hour TTL (fresh-for-the-day)

function isFresh(item) {
  if (!item || !item.time) return false;
  const ts = eventTimestamp(item.time);
  if (!ts) return false;
  // YouTube AI / POE2 video cards get a longer 6-hour window so AI uploads
  // (which are less frequent than news) actually have time to appear.
  const maxAge = item._isVideo ? VIDEO_MAX_AGE_MS : CARD_MAX_AGE_MS;
  return Date.now() - ts < maxAge;
}

// Signature of the currently rendered rail so we can skip pointless rebuilds
// when polled data is identical to what's already on screen — eliminates the
// 25-second visual flicker the user reported.
let renderedNewsSignature = "";

function renderNews() {
  if (!els.newsTrack) return;

  // Merged feed: AI news + emergency news + AI videos. Newest first.
  const merged = [
    ...state.news,
    ...state.aiVideos.map((v) => ({ ...v, _isVideo: true })),
  ]
    .filter((i) => i && i.title && isFresh(i))
    .sort((a, b) => eventTimestamp(b.time) - eventTimestamp(a.time));

  if (!merged.length) {
    const emptySig = "EMPTY";
    if (renderedNewsSignature !== emptySig) {
      els.newsTrack.innerHTML = `<div class="rail-empty"><strong>Standing by…</strong>No fresh AI news in the window yet. The desk polls every 25s — new stories drop in live.</div>`;
      renderedNewsSignature = emptySig;
      renderHero(null);
    }
    if (els.newsMeta) els.newsMeta.textContent = `0 live`;
    return;
  }

  const aiCount = merged.filter((i) => i.category === "ai" || i.category === "ai-video").length;
  const emergencyCount = merged.filter((i) => i.category === "emergency").length;
  if (els.newsMeta) els.newsMeta.textContent = `${merged.length} live · ${emergencyCount} emergency`;
  if (els.newsTelemetry) els.newsTelemetry.textContent = `${merged.length} items`;

  // Animated counters
  setCounter(els.mStories, merged.length);
  setCounter(els.mAi, aiCount);

  // Top headline strip
  if (els.nowHeadline) els.nowHeadline.textContent = merged[0].title;
  if (els.nowTag) els.nowTag.textContent = merged[0].category === "emergency" ? "EMERGENCY" : "LATEST";

  // Signature so identical polls don't rebuild the DOM
  const slice = merged.slice(0, 40);
  const minuteBucket = Math.floor(Date.now() / 60000);
  const freshTag = `${state.freshNewsIds.size}:${state.freshVideoIds.size}`;
  const sig = `${minuteBucket}|${freshTag}|` + slice.map((i) => i.id).join(",");
  if (sig === renderedNewsSignature) return;
  renderedNewsSignature = sig;

  // Hero = newest; stream = the rest
  renderHero(merged[0]);
  els.newsTrack.innerHTML = slice.slice(1).map((item) => {
    if (item._isVideo) return videoCardHtml(item, state.freshVideoIds);
    return newsCardHtml(item);
  }).join("");
  bindCardClicks();
  renderHeadlineTicker(merged);

  if ((state.freshNewsIds.size > 0 || state.freshVideoIds.size > 0) && els.newsTrack.scrollTo) {
    els.newsTrack.scrollTo({ top: 0, behavior: "smooth" });
  }
}

/* === Live activity log === */
const ACTIVITY_TAGS = { news: "NEWS", ai: "AI", video: "VIDEO", breaking: "BREAK", camera: "CAM", market: "MKT", flag: "FLAG", sync: "SYNC", social: "SOC" };
let activityCount = 0;
let activitySeq = 0;
const activityItems = new Map(); // aid -> full story data for the slide-in

function addActivity(kind, msg, data = null) {
  if (!els.activityLog || !msg) return;
  const li = document.createElement("li");
  li.className = `activity-item k-${kind}`;
  const t = new Date();
  const ts = `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}:${String(t.getUTCSeconds()).padStart(2, "0")}`;
  li.innerHTML = `<span class="at">${ts}</span><span class="tag">${ACTIVITY_TAGS[kind] || kind.toUpperCase()}</span><span class="msg"></span>`;
  li.querySelector(".msg").textContent = msg;
  if (data) {
    activitySeq += 1;
    li.dataset.aid = String(activitySeq);
    li.style.cursor = "pointer";
    activityItems.set(String(activitySeq), data);
    // Cap the map alongside the DOM
    if (activityItems.size > 120) {
      const firstKey = activityItems.keys().next().value;
      activityItems.delete(firstKey);
    }
  }
  els.activityLog.prepend(li);
  activityCount += 1;
  while (els.activityLog.children.length > 60) els.activityLog.lastChild.remove();
  if (els.activityMeta) els.activityMeta.textContent = `${activityCount} events`;
}

// One delegated listener: click any activity row → full-story slide-in
function initActivityClicks() {
  if (!els.activityLog) return;
  els.activityLog.addEventListener("click", (e) => {
    const li = e.target.closest(".activity-item");
    if (!li || !li.dataset.aid) return;
    const item = activityItems.get(li.dataset.aid);
    if (item) openWebView({ story: item });
  });
}

/* === Animated number counters === */
function setCounter(el, target) {
  if (!el) return;
  const cur = parseInt(el.textContent.replace(/\D/g, ""), 10) || 0;
  if (cur === target) return;
  const step = Math.max(1, Math.ceil(Math.abs(target - cur) / 12));
  let v = cur;
  const tick = () => {
    v += target > v ? step : -step;
    if ((step > 0 && v >= target) || (target < cur && v <= target)) v = target;
    el.textContent = v;
    if (v !== target) requestAnimationFrame(tick);
  };
  tick();
}

function bindCardClicks() {
  els.newsTrack.querySelectorAll("[data-news-card]").forEach((card) => {
    card.addEventListener("click", (e) => {
      e.preventDefault();
      const url = card.dataset.url;
      const embed = card.dataset.embed;
      const source = card.dataset.source;
      const title = card.dataset.title;
      if (url || embed) openWebView({ url: embed || url, externalUrl: url, source, title });
    });
  });
}


/* === News ticker step-scroll ===
 * Every 3 seconds, advance the rail by one full card width (with a smooth
 * slide). Older stories step past the left edge until we wrap back to the
 * start. Pauses on hover. Newest items snap to the front via renderNews(). */
let newsTickerHovered = false;
let newsTickerTimer = null;

// The news stream is now a VERTICAL feed (newest at top) — no horizontal
// step-scroll. These are kept as harmless no-ops so older call sites don't break.
function armNewsTicker() { /* vertical stream: no auto-scroll */ }
function startNewsTicker() { /* no-op */ }

/* === Breaking news popup + queue ===
 *
 * Flow:
 *   1. Server returns list of news items (sorted newest-first).
 *   2. detectBreakingNews() compares against seenNewsIds.
 *      - New IDs go into state.pendingNews (held back from the rail).
 *      - state.news = server list minus anything in pendingNews.
 *   3. showNextBreakingPopup() displays the head of pendingNews for 30s.
 *   4. When the popup auto-dismisses or × is clicked, that item moves out of
 *      pending into the visible rail (position 1, with a 5.5s flash), and
 *      the next pending item (if any) pops up. */
function visibleNewsFromRaw() {
  const pendingIds = new Set(state.pendingNews.map((i) => i.id));
  return state.rawNews.filter((item) => !pendingIds.has(item.id));
}

// --- Persistent "already played" tracking (localStorage) ---
const PLAYED_NEWS_KEY = "matrix.playedNewsIds";
const ANNOUNCED_NEWS_KEY = "matrix.announcedNewsIds";
const PLAYED_NEWS_MAX = 3000; // cap so storage never grows unbounded

function loadPlayedNews() {
  try {
    const played = JSON.parse(localStorage.getItem(PLAYED_NEWS_KEY) || "[]");
    const announced = JSON.parse(localStorage.getItem(ANNOUNCED_NEWS_KEY) || "[]");
    state.playedNewsIds = new Set(Array.isArray(played) ? played : []);
    state.announcedNewsIds = new Set(Array.isArray(announced) ? announced : []);
  } catch (_) {
    state.playedNewsIds = new Set();
    state.announcedNewsIds = new Set();
  }
}

function persistPlayedNews() {
  try {
    // Keep only the most-recent PLAYED_NEWS_MAX ids (Sets preserve insertion order)
    let played = [...state.playedNewsIds];
    if (played.length > PLAYED_NEWS_MAX) {
      played = played.slice(played.length - PLAYED_NEWS_MAX);
      state.playedNewsIds = new Set(played);
    }
    let announced = [...state.announcedNewsIds];
    if (announced.length > PLAYED_NEWS_MAX) {
      announced = announced.slice(announced.length - PLAYED_NEWS_MAX);
      state.announcedNewsIds = new Set(announced);
    }
    localStorage.setItem(PLAYED_NEWS_KEY, JSON.stringify(played));
    localStorage.setItem(ANNOUNCED_NEWS_KEY, JSON.stringify(announced));
  } catch (_) { /* storage full / disabled — degrade gracefully */ }
}

loadPlayedNews();

function detectBreakingNews(items) {
  if (!items) return;
  state.rawNews = items;
  const isFirstLoad = !state.newsBootstrapped;

  if (isFirstLoad) {
    // First poll of this page-load: everything currently in the feed is "old
    // news" for this viewer — mark all as played (so a later reload won't
    // re-announce them) but DON'T pop the breaking box.
    state.newsBootstrapped = true;
    items.forEach((item) => state.playedNewsIds.add(item.id));
    persistPlayedNews();
    state.news = items;
    // Seed the live activity log with the most recent stories so it isn't empty
    items.slice(0, 12).reverse().forEach((item) => {
      const k = item.category === "emergency" ? "breaking" : "ai";
      addActivity(k, `${item.source}: ${item.title}`, item);
    });
    // Plant a few flags right away so the globe immediately shows AI news.
    const recentAi = items
      .filter((i) => i.category === "ai" || i.category === "emergency")
      .slice(0, 4);
    recentAi.forEach((item, idx) => {
      setTimeout(() => dropNewsFlag(item, item.category === "emergency"), idx * 1400);
    });
    return;
  }

  // Subsequent polls: an item is "breaking" ONLY if its stable id has NEVER
  // been played before (this page-load or any previous one).
  const incoming = items.filter((item) => !state.playedNewsIds.has(item.id));
  if (incoming.length) {
    incoming.forEach((item) => state.playedNewsIds.add(item.id));
    persistPlayedNews();
    state.pendingNews.push(...incoming);
    incoming.forEach((item) => {
      const isEmergency = item.category === "emergency";
      addActivity(isEmergency ? "breaking" : "ai", `${item.source}: ${item.title}`, item);
      if (item.category === "ai" || isEmergency) dropNewsFlag(item, isEmergency);
    });
  }
  state.news = visibleNewsFromRaw();
  showNextBreakingPopup();
}

function showNextBreakingPopup() {
  if (!els.breakingPopup) return;
  if (state.breakingTimer) return; // popup already up
  if (!state.pendingNews.length) return;

  const item = state.pendingNews[0]; // peek; promoted on dismiss
  // Record that this item actually got the breaking treatment → ✓ badge on its card
  state.announcedNewsIds.add(item.id);
  persistPlayedNews();
  els.breakingPopup.innerHTML = `
    <div class="breaking-head">
      <span class="breaking-tag">BREAKING</span>
      <span class="breaking-source">${item.source || ""}</span>
      <button class="breaking-close" type="button" aria-label="Dismiss">×</button>
    </div>
    <h3>${item.title || "Breaking story"}</h3>
    <p>${item.summary || ""}</p>
    <div class="breaking-meta">
      <a href="${item.url || "#"}" target="_blank" rel="noreferrer" style="color: var(--cyber); text-decoration: none; font-weight: 700;">Open story →</a>
      <span>${relativeTime(item.time)}</span>
    </div>
    <div class="breaking-progress"></div>
  `;
  els.breakingPopup.classList.remove("hidden");
  void els.breakingPopup.offsetWidth;
  els.breakingPopup.classList.add("visible");

  els.breakingPopup.querySelector(".breaking-close").addEventListener("click", () => dismissBreakingPopup(true));

  state.breakingTimer = setTimeout(() => dismissBreakingPopup(true), 30000);

  playAlertSound("breaking-news");
  jarvisAnnounce(item);
}

function dismissBreakingPopup(promote = true) {
  if (!els.breakingPopup) return;
  if (state.breakingTimer) {
    clearTimeout(state.breakingTimer);
    state.breakingTimer = null;
  }
  els.breakingPopup.classList.remove("visible");

  if (promote && state.pendingNews.length) {
    const promoted = state.pendingNews.shift();
    // Promote the item into the visible rail in the 1st position with a flash
    state.freshNewsIds = new Set([promoted.id]);
    state.news = visibleNewsFromRaw();
    renderNews();
    setTimeout(() => {
      state.freshNewsIds.delete(promoted.id);
      renderNews();
    }, 5500);
  }

  setTimeout(() => {
    if (!els.breakingPopup.classList.contains("visible")) {
      els.breakingPopup.classList.add("hidden");
    }
    // Chain to next pending after a small breather
    if (state.pendingNews.length) {
      setTimeout(showNextBreakingPopup, 700);
    }
  }, 280);
}

/* === Map hover tooltip === */
function showMapTooltip(event, clientX, clientY) {
  if (!els.mapTooltip || !event) return;
  if (state.hoveredEventId === event.id && !els.mapTooltip.classList.contains("hidden")) {
    positionMapTooltip(clientX, clientY);
    return;
  }
  state.hoveredEventId = event.id;
  const color = hexCss(colorForLayer(event.layer));
  const metric = eventMetric(event);
  els.mapTooltip.innerHTML = `
    <div class="map-tooltip-head">
      <span class="dot" style="background:${color}; box-shadow: 0 0 6px ${color};"></span>
      <span>${event.layer.replace("-", " ")}</span>
    </div>
    <h4>${event.title}</h4>
    <div class="map-tooltip-meta">
      <strong>SRC</strong><span>${event.source || ""}</span>
      <strong>SIG</strong><span>${metric}</span>
      <strong>SEV</strong><span>${(event.severity || "low").toUpperCase()}</span>
      <strong>POS</strong><span>${event.lat.toFixed(2)}, ${event.lon.toFixed(2)}</span>
      <strong>TIME</strong><span>${relativeTime(event.time)} ago</span>
    </div>
  `;
  els.mapTooltip.classList.remove("hidden");
  positionMapTooltip(clientX, clientY);
}

function positionMapTooltip(clientX, clientY) {
  if (!els.mapTooltip) return;
  const tip = els.mapTooltip;
  const margin = 14;
  // Use offsetWidth/Height after content set
  const w = tip.offsetWidth || 240;
  const h = tip.offsetHeight || 90;
  let x = clientX + margin;
  let y = clientY + margin;
  if (x + w > window.innerWidth - 8) x = clientX - w - margin;
  if (y + h > window.innerHeight - 8) y = clientY - h - margin;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
  tip.style.transform = "none";
}

function hideMapTooltip() {
  if (!els.mapTooltip) return;
  state.hoveredEventId = null;
  els.mapTooltip.classList.add("hidden");
}

/* === Webview slide-out ===
 * When the user clicks any news / video card the app slides a webview iframe
 * in from the left. The iframe attempts to load the source URL. Most major
 * publishers block iframe embedding via X-Frame-Options, in which case the
 * fallback overlay invites them to open externally instead. YouTube embeds
 * work natively (we use /embed/ URLs for video cards). */
function openWebView({ url, externalUrl, source, title, story }) {
  if (!els.webView) return;

  // STORY MODE — a formatted full-story view (used by the live-activity feed).
  // Reliable even when the publisher blocks iframes; "Read original" loads the
  // iframe in place.
  if (story) {
    const isEmergency = story.category === "emergency";
    const isVideo = !!story._isVideo;
    const img = story.thumbnail || (story.video_id ? `https://i.ytimg.com/vi/${story.video_id}/hqdefault.jpg` : "");
    const embedUrl = isVideo && story.video_id ? `https://www.youtube.com/embed/${story.video_id}?autoplay=1` : "";
    els.webViewSource.textContent = story.source || "DESK";
    els.webViewTitle.textContent = story.title || "";
    els.webViewExternal.href = story.url || "#";
    els.webViewFallback.classList.add("hidden");
    els.webViewFrame.classList.add("hidden");
    els.webViewFrame.src = "about:blank";
    if (els.webViewStory) {
      els.webViewStory.classList.remove("hidden");
      els.webViewStory.innerHTML = `
        <span class="story-badge ${isEmergency ? "emergency" : ""}">${isEmergency ? "● EMERGENCY" : isVideo ? "● AI VIDEO" : "● AI INTELLIGENCE"}</span>
        <h1>${story.title || ""}</h1>
        <div class="story-meta">
          <span><b>SOURCE</b> ${story.source || "—"}</span>
          <span><b>FILED</b> ${story.time ? `${relativeTime(story.time)} ago` : "—"}</span>
          ${story.category ? `<span><b>CHANNEL</b> ${story.category.toUpperCase()}</span>` : ""}
          ${story.score != null ? `<span><b>ENGAGEMENT</b> ${story.score}▲</span>` : ""}
        </div>
        ${img ? `<img class="story-img" src="${img}" alt="" loading="lazy">` : ""}
        <p class="story-summary">${story.summary || story.text || "No further detail on the wire yet — open the original for the full report."}</p>
        <div class="story-actions">
          ${story.url || embedUrl ? `<button type="button" class="story-open">${isVideo ? "▶ Play video here" : "Read original here"} →</button>` : ""}
        </div>`;
      const openBtn = els.webViewStory.querySelector(".story-open");
      if (openBtn) {
        openBtn.addEventListener("click", () => {
          openWebView({ url: embedUrl || story.url, externalUrl: story.url, source: story.source, title: story.title });
        }, { once: true });
      }
    }
    els.webView.classList.remove("hidden");
    requestAnimationFrame(() => els.webView.classList.add("open"));
    return;
  }

  if (!url) return;
  if (els.webViewStory) { els.webViewStory.classList.add("hidden"); els.webViewStory.innerHTML = ""; }
  els.webViewFrame.classList.remove("hidden");
  els.webViewSource.textContent = source || "SOURCE";
  els.webViewTitle.textContent = title || url;
  els.webViewExternal.href = externalUrl || url;
  els.webViewFallback.classList.add("hidden");
  els.webViewFrame.src = url;

  // Detect iframe load failure (X-Frame-Options blocked → load event never fires)
  let loaded = false;
  const loadHandler = () => { loaded = true; };
  els.webViewFrame.addEventListener("load", loadHandler, { once: true });
  setTimeout(() => {
    if (!loaded) {
      els.webViewFallback.classList.remove("hidden");
    }
  }, 4000);

  els.webView.classList.remove("hidden");
  // next frame so the transition runs
  requestAnimationFrame(() => els.webView.classList.add("open"));
}

function closeWebView() {
  if (!els.webView) return;
  els.webView.classList.remove("open");
  setTimeout(() => {
    els.webView.classList.add("hidden");
    if (els.webViewFrame) { els.webViewFrame.src = "about:blank"; els.webViewFrame.classList.remove("hidden"); }
    if (els.webViewStory) { els.webViewStory.classList.add("hidden"); els.webViewStory.innerHTML = ""; }
  }, 320);
}

/* === Crypto top bar === */
function renderCryptoBar() {
  if (!els.cryptoBarTrack) return;
  const widget = state.intel.find((w) => w.kind === "crypto");
  if (!widget || !widget.items?.length) return;
  els.cryptoBarTrack.innerHTML = widget.items.map((c) => {
    const change = Number(c.change);
    const cls = change >= 0 ? "up" : "down";
    const sign = change >= 0 ? "+" : "";
    return `
      <div class="crypto-tile" title="${c.name || c.symbol}">
        <span class="sym">${(c.symbol || "").toUpperCase()}</span>
        <span class="price">$${formatPrice(c.price)}</span>
        <span class="delta ${cls}">${sign}${change?.toFixed(2)}%</span>
      </div>
    `;
  }).join("");
  // Log a market line when BTC moves (throttled to avoid spam)
  const btc = widget.items.find((c) => (c.symbol || "").toUpperCase() === "BTC");
  if (btc && btc.price !== lastBtcPrice) {
    lastBtcPrice = btc.price;
    const ch = Number(btc.change);
    addActivity("market", `BTC $${formatPrice(btc.price)} ${ch >= 0 ? "▲" : "▼"}${Math.abs(ch).toFixed(2)}%`);
  }
}
let lastBtcPrice = null;

/* === Hacker News ticker === */
function renderHnTicker() {
  if (!els.hnTickerTrack) return;
  const widget = state.intel.find((w) => w.kind === "hn");
  if (!widget || !widget.items?.length) return;
  // Duplicate the content so the marquee loops seamlessly
  const item = (s) => `<a href="${s.url}" target="_blank" rel="noreferrer"><strong>${s.score || 0}▲</strong>${s.title}</a>`;
  const html = widget.items.map(item).join("");
  els.hnTickerTrack.innerHTML = `<div class="hn-ticker-track-inner">${html}${html}</div>`;
}

/* === Intel widgets === */
function renderIntel() {
  // Crypto fills the markets card top; HN feeds the bottom ticker
  renderCryptoBar();
  renderHnTicker();
  // The signals panel = AI Pulse (trending models, fresh papers, hot repos) +
  // the next SpaceX launch. FX/wiki/APOD removed per design.
  const pulse = state.aipulse || {};
  const spacex = (state.intel.find((w) => w.kind === "spacex") || {}).items?.[0];
  const blocks = [];

  if (pulse.models?.length) {
    blocks.push(`
      <div class="intel-card">
        <div class="intel-card-head">🤗 Trending Models<small>huggingface</small></div>
        ${pulse.models.slice(0, 6).map((m) => `
          <a href="${m.url}" target="_blank" rel="noreferrer">${m.id}<span class="meta">${m.likes ?? 0}♥ · ${m.task || ""}</span></a>
        `).join("")}
      </div>`);
  }
  if (pulse.papers?.length) {
    blocks.push(`
      <div class="intel-card">
        <div class="intel-card-head">📄 Latest AI Research<small>arXiv cs.AI</small></div>
        ${pulse.papers.slice(0, 6).map((p) => `
          <a href="${p.url}" target="_blank" rel="noreferrer">${p.title}<span class="meta">${relativeTime(p.time)}</span></a>
        `).join("")}
      </div>`);
  }
  if (pulse.repos?.length) {
    blocks.push(`
      <div class="intel-card">
        <div class="intel-card-head">⭐ Fresh AI Repos<small>github · this week</small></div>
        ${pulse.repos.slice(0, 5).map((r) => `
          <a href="${r.url}" target="_blank" rel="noreferrer">${r.name}<span class="meta">${r.stars}★</span></a>
        `).join("")}
      </div>`);
  }
  if (spacex) {
    blocks.push(`
      <div class="intel-card">
        <div class="intel-card-head">🚀 Next SpaceX Launch<small>spacex</small></div>
        <a href="${spacex.links || "#"}" target="_blank" rel="noreferrer">${spacex.name || "Next launch"}</a>
        <p class="meta">T-${spacex.date ? formatCountdown(spacex.date) : "TBA"}</p>
      </div>`);
  }
  if (els.intelMeta) {
    const n = (pulse.models?.length || 0) + (pulse.papers?.length || 0) + (pulse.repos?.length || 0);
    els.intelMeta.textContent = n ? `${n} signals live` : "loading…";
  }
  if (els.intelPanel) {
    els.intelPanel.innerHTML = blocks.join("") || `<div class="intel-card"><div class="intel-card-head">Loading AI signals…</div></div>`;
  }
}

function formatPrice(n) {
  if (n === null || n === undefined) return "--";
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function formatCountdown(iso) {
  const t = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(t)) return "TBA";
  const abs = Math.abs(t);
  const days = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  const sign = t < 0 ? "+" : "";
  return `${sign}${days}d ${hours}h`;
}

/* =========================================================================
   TESLA — live quote + intraday sparkline (Yahoo via /api/stock, 60s poll)
   ========================================================================= */
async function pollStock() {
  try {
    const res = await fetch(`/api/stock?ts=${Date.now()}`);
    if (!res.ok) return;
    const d = await res.json();
    if (!d || d.price == null) return;
    const prevPrice = state.stock?.price;
    state.stock = d;
    const up = (d.change ?? 0) >= 0;
    if (els.tslaPrice) els.tslaPrice.textContent = `$${Number(d.price).toFixed(2)}`;
    if (els.tslaChange) {
      els.tslaChange.textContent = `${up ? "▲" : "▼"} ${Math.abs(d.change ?? 0).toFixed(2)} (${Math.abs(d.changePct ?? 0).toFixed(2)}%)`;
      els.tslaChange.className = `tesla-change ${up ? "up" : "down"}`;
    }
    if (els.tslaState) els.tslaState.textContent = (d.marketState || "LIVE").toString().toUpperCase();
    if (els.tslaLow) els.tslaLow.textContent = `L $${Number(d.dayLow ?? 0).toFixed(2)}`;
    if (els.tslaHigh) els.tslaHigh.textContent = `H $${Number(d.dayHigh ?? 0).toFixed(2)}`;
    drawTslaChart(d.points || [], up, d.prevClose);
    if (prevPrice != null && prevPrice !== d.price) {
      addActivity("market", `TSLA $${Number(d.price).toFixed(2)} ${up ? "▲" : "▼"}${Math.abs(d.changePct ?? 0).toFixed(2)}%`);
    }
  } catch (_) { /* transient */ }
}

function drawTslaChart(points, up, prevClose) {
  const cv = els.tslaChart;
  if (!cv || !points.length) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.clientWidth || 320;
  const h = cv.clientHeight || 84;
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const vals = points.map((p) => p.c);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (prevClose) { min = Math.min(min, prevClose); max = Math.max(max, prevClose); }
  const pad = (max - min) * 0.12 || 1;
  min -= pad; max += pad;
  const X = (i) => (i / (points.length - 1)) * (w - 4) + 2;
  const Y = (v) => h - ((v - min) / (max - min)) * (h - 6) - 3;
  const color = up ? "#22e6a0" : "#ff5a3c";
  // prev-close dashed reference line
  if (prevClose) {
    ctx.strokeStyle = "rgba(126,156,214,0.35)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, Y(prevClose)); ctx.lineTo(w, Y(prevClose)); ctx.stroke();
    ctx.setLineDash([]);
  }
  // area fill
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, up ? "rgba(34,230,160,0.28)" : "rgba(255,90,60,0.28)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.beginPath();
  points.forEach((p, i) => { const x = X(i), y = Y(p.c); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.lineTo(X(points.length - 1), h); ctx.lineTo(X(0), h); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  // price line
  ctx.beginPath();
  points.forEach((p, i) => { const x = X(i), y = Y(p.c); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.stroke();
  // last-price dot
  const lx = X(points.length - 1), ly = Y(points[points.length - 1].c);
  ctx.beginPath(); ctx.arc(lx, ly, 2.6, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
}

/* =========================================================================
   SOCIAL PULSE — Mastodon + Lemmy + HN-live (small cards above the stream)
   ========================================================================= */
const NETWORK_LABEL = { mastodon: "MSTDN", lemmy: "LEMMY", hn: "HN" };

async function pollSocial(opts = {}) {
  try {
    const res = await fetch(`/api/social?ts=${Date.now()}`);
    if (!res.ok) return;
    const d = await res.json();
    const items = d.items || [];
    // Activity entries for never-seen posts (skip flood on bootstrap)
    if (!opts.bootstrap) {
      items.filter((i) => !state.seenSocialIds.has(i.id)).slice(0, 4).forEach((i) => {
        addActivity("social", `${i.author}: ${i.text.slice(0, 90)}`, { ...i, title: i.text.slice(0, 120), source: i.author, category: "social" });
      });
    }
    items.forEach((i) => state.seenSocialIds.add(i.id));
    state.social = items;
    renderSocialStrip();
  } catch (_) { /* transient */ }
}

function renderSocialStrip() {
  if (!els.socialStrip) return;
  const items = (state.social || []).slice(0, 16);
  if (!items.length) {
    els.socialStrip.innerHTML = `<div class="social-card"><p>Listening for social chatter…</p></div>`;
    return;
  }
  if (els.socialMeta) {
    const nets = [...new Set(items.map((i) => i.network))];
    els.socialMeta.textContent = `${items.length} posts · ${nets.join(" · ")}`;
  }
  els.socialStrip.innerHTML = items.map((i) => `
    <a class="social-card" href="${i.url || "#"}" target="_blank" rel="noreferrer" data-social-id="${i.id}">
      <div class="social-card-meta">
        <span class="social-net ${i.network}">${NETWORK_LABEL[i.network] || i.network}</span>
        <span class="social-author">${i.author || ""}</span>
        <span class="social-score">${i.score ? `${i.score}▲` : ""}</span>
      </div>
      <p>${i.text || ""}</p>
      <span class="social-time">${relativeTime(i.time)} ago</span>
    </a>
  `).join("");
}

/* =========================================================================
   AI PULSE — arXiv papers, HF models, GitHub repos (10-min poll)
   ========================================================================= */
async function pollAiPulse() {
  try {
    const res = await fetch(`/api/aipulse?ts=${Date.now()}`);
    if (!res.ok) return;
    state.aipulse = await res.json();
    renderIntel();
  } catch (_) { /* transient */ }
}

/* =========================================================================
   J.A.R.V.I.S. — desk voice agent
   "Just A Rather Very Intelligent System"
   ========================================================================= */
const JARVIS_OPENERS = [
  "Pardon the interruption, sir.",
  "Sir, incoming intelligence.",
  "Apologies for the intrusion, sir.",
  "Sir, you may want to see this.",
  "A development on the wire, sir.",
];

function jarvisGreeting() {
  const h = new Date().getHours();
  const tod = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${tod}, sir. All desk systems are online. I'll keep you informed as events develop.`;
}

function jarvisLogMsg(from, text) {
  if (!els.jarvisLog) return;
  const div = document.createElement("div");
  div.className = `jarvis-msg from-${from}`;
  div.textContent = text;
  els.jarvisLog.appendChild(div);
  els.jarvisLog.scrollTop = els.jarvisLog.scrollHeight;
  while (els.jarvisLog.children.length > 50) els.jarvisLog.firstChild.remove();
}

// JARVIS speaks with the British male voice (Daniel) when available —
// the closest match to the films. Falls back to the Google TTS proxy.
function jarvisSpeak(text) {
  jarvisLogMsg("jarvis", text);
  if (!state.voiceEnabled) return;
  if (els.jarvisOrb) {
    els.jarvisOrb.classList.add("speaking");
    setTimeout(() => els.jarvisOrb.classList.remove("speaking"), Math.min(12000, text.length * 65));
  }
  stopActiveVoice();
  try {
    if ("speechSynthesis" in window) {
      const utter = new SpeechSynthesisUtterance(text);
      const v = pickPreferredVoice(); // prefers Daniel (en-GB male)
      if (v) utter.voice = v;
      utter.rate = 1.04;
      utter.pitch = 0.92;
      utter.volume = 0.95;
      speechSynthesis.speak(utter);
      return;
    }
  } catch (_) {}
  // Fallback: server TTS
  try {
    const audio = new Audio(`/api/tts?lang=en-GB&text=${encodeURIComponent(text)}`);
    audio.volume = 0.9;
    const handle = { audio, suppressFallback: true };
    liveVoiceAudios.add(handle);
    audio.play().catch(() => {});
  } catch (_) {}
}

// Breaking-news announcements, JARVIS style
function jarvisAnnounce(item) {
  const isEmergency = item.category === "emergency";
  const opener = isEmergency
    ? "Sir, priority alert."
    : JARVIS_OPENERS[Math.floor(Math.random() * JARVIS_OPENERS.length)];
  const tail = isEmergency ? " I suggest your immediate attention." : "";
  jarvisSpeak(`${opener} ${item.source || "The wire"} reports: ${item.title}.${tail}`);
}

// Rule-based command brain — answers from live desk state
function jarvisAnswer(qRaw) {
  const q = (qRaw || "").toLowerCase();
  const newsTop = [...state.news].filter((i) => isFresh(i)).slice(0, 3);
  const btc = (state.intel.find((w) => w.kind === "crypto") || {}).items?.find((c) => (c.symbol || "").toUpperCase() === "BTC");

  if (/\b(hello|hi|hey|good (morning|afternoon|evening))\b/.test(q)) return jarvisGreeting();
  if (/\b(who are you|your name|what are you)\b/.test(q))
    return "I am JARVIS — Just A Rather Very Intelligent System. I monitor the newswire, the markets, the cameras and the globe so you don't have to, sir.";
  if (/\b(status|report|systems?|how('s| is) (it|everything))\b/.test(q)) {
    const cams = state.cameras.filter((c) => c.embedUrl).length;
    return `All systems nominal, sir. ${els.mSources?.textContent || "—"} sources streaming, ${state.news.length} stories on the wire, ${cams} live cameras, and ${state.events.length} global signals tracked.`;
  }
  if (/\b(tesla|tsla|stock|elon)\b/.test(q)) {
    const s = state.stock;
    if (!s || s.price == null) return "Tesla telemetry is still coming online, sir. One moment.";
    const dir = (s.change ?? 0) >= 0 ? "up" : "down";
    return `Tesla is trading at $${Number(s.price).toFixed(2)}, ${dir} ${Math.abs(s.changePct ?? 0).toFixed(2)} percent on the day. Range $${Number(s.dayLow).toFixed(0)} to $${Number(s.dayHigh).toFixed(0)}, sir.`;
  }
  if (/\b(bitcoin|btc|crypto|ethereum|eth)\b/.test(q)) {
    if (!btc) return "Crypto telemetry is warming up, sir.";
    const ch = Number(btc.change);
    return `Bitcoin stands at $${formatPrice(btc.price)}, ${ch >= 0 ? "up" : "down"} ${Math.abs(ch).toFixed(2)} percent over twenty-four hours, sir.`;
  }
  if (/\b(news|headline|latest|happening|brief)\b/.test(q)) {
    if (!newsTop.length) return "The wire is quiet at the moment, sir. I'll alert you the instant something breaks.";
    return `The latest, sir: ${newsTop.map((i, n) => `${n + 1}. ${i.title}`).join(". ")}.`;
  }
  if (/\b(video)\b/.test(q)) {
    const v = state.aiVideos[0];
    return v ? `The most recent AI video is "${v.title}" from ${v.source}, sir. It's queued on the desk.` : "No fresh AI video in the current window, sir.";
  }
  if (/\b(camera|cams)\b/.test(q)) {
    const cams = state.cameras.filter((c) => c.embedUrl);
    return `${cams.length} live cameras on the wall, sir: ${cams.map((c) => c.title.replace(/ Live$/, "")).join("; ")}.`;
  }
  if (/\b(time|clock|date)\b/.test(q)) {
    return `It is ${new Date().toUTCString().replace("GMT", "UTC")}, sir.`;
  }
  if (/\b(research|paper|arxiv|model)\b/.test(q)) {
    const p = state.aipulse?.papers?.[0];
    const m = state.aipulse?.models?.[0];
    const parts = [];
    if (p) parts.push(`the latest paper on arXiv is "${p.title}"`);
    if (m) parts.push(`the trending model on Hugging Face is ${m.id}`);
    return parts.length ? `From the research wire, sir: ${parts.join(", and ")}.` : "The research feed is still loading, sir.";
  }
  if (/\b(thank|thanks|cheers)\b/.test(q)) return "Always a pleasure, sir.";
  if (/\b(joke|funny)\b/.test(q)) return "I would tell you a joke about artificial intelligence, sir, but you'd only say I made it up.";
  return "I'm afraid that's beyond my current clearance, sir. A direct uplink to a language model would expand my faculties considerably — do say the word.";
}

function handleJarvisQuery(text) {
  const t = (text || "").trim();
  if (!t) return;
  jarvisLogMsg("user", t);
  setTimeout(() => jarvisSpeak(jarvisAnswer(t)), 220);
}

let jarvisRecognition = null;
function initJarvis() {
  if (!els.jarvisOrb) return;
  els.jarvisOrb.addEventListener("click", () => {
    const opening = els.jarvisPanel.classList.contains("hidden");
    els.jarvisPanel.classList.toggle("hidden");
    if (opening && !els.jarvisLog.children.length) {
      jarvisSpeak(jarvisGreeting());
    }
    if (opening) setTimeout(() => els.jarvisInput?.focus(), 120);
  });
  if (els.jarvisClose) els.jarvisClose.addEventListener("click", () => els.jarvisPanel.classList.add("hidden"));
  if (els.jarvisForm) {
    els.jarvisForm.addEventListener("submit", (e) => {
      e.preventDefault();
      handleJarvisQuery(els.jarvisInput.value);
      els.jarvisInput.value = "";
    });
  }
  // Voice input (Chrome/Edge SpeechRecognition)
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR && els.jarvisMic) {
    jarvisRecognition = new SR();
    jarvisRecognition.lang = "en-US";
    jarvisRecognition.interimResults = false;
    jarvisRecognition.maxAlternatives = 1;
    jarvisRecognition.onresult = (e) => {
      const said = e.results[0][0].transcript;
      els.jarvisInput.value = said;
      handleJarvisQuery(said);
      els.jarvisInput.value = "";
    };
    const stopUi = () => { els.jarvisMic.classList.remove("listening"); els.jarvisOrb.classList.remove("listening"); };
    jarvisRecognition.onend = stopUi;
    jarvisRecognition.onerror = stopUi;
    els.jarvisMic.addEventListener("click", () => {
      try {
        els.jarvisMic.classList.add("listening");
        els.jarvisOrb.classList.add("listening");
        jarvisRecognition.start();
      } catch (_) { /* already started */ }
    });
  } else if (els.jarvisMic) {
    els.jarvisMic.disabled = true;
    els.jarvisMic.title = "Voice input requires Chrome/Edge";
    els.jarvisMic.style.opacity = "0.4";
  }
}

function renderPopup(event) {
  if (!event) {
    els.eventPopup.classList.add("hidden");
    return;
  }
  els.eventPopup.innerHTML = `
    <div class="signpost-label">${event.layer.replace("-", " ").toUpperCase()}</div>
    <h2>${event.title}</h2>
    <p>${event.summary}</p>
    <div class="popup-meta">
      <span>${event.source}</span>
      <span>${event.severity.toUpperCase()}</span>
      <span>${formatTime(event.time)}</span>
      <span>${event.lat.toFixed(2)}, ${event.lon.toFixed(2)}</span>
    </div>
  `;
  els.eventPopup.classList.remove("hidden");
}

function eventGlyph(event) {
  const key = eventIconKey(event);
  const glyphs = {
    aircraft: "✈",
    earthquake: "≋",
    satellite: "◈",
    "camera-live": "▣",
    "camera-still": "▣",
    "weather-general": "☁",
    "weather-storm": "↯",
    "weather-rain": "☂",
    "weather-snow": "❄",
    "weather-wind": "≋",
    "air-quality": "○",
    ocean: "≈",
    "disaster-flood": "≈",
    "disaster-drought": "☀",
    "disaster-cyclone": "⟳",
    "disaster-general": "!",
    "natural-fire": "♨",
    "natural-volcano": "▲",
    "natural-ice": "❄",
    "natural-general": "▲",
    "space-weather": "☼",
  };
  return glyphs[key] ?? "•";
}

function updatePopupPosition() {
  if (!state.selectedId || els.eventPopup.classList.contains("hidden")) return;
  const marker = state.markers.get(state.selectedId);
  if (!marker) return;
  const worldPosition = new THREE.Vector3();
  marker.getWorldPosition(worldPosition);
  const projected = worldPosition.clone().project(camera);
  const x = (projected.x * 0.5 + 0.5) * els.globe.clientWidth;
  const y = (-projected.y * 0.5 + 0.5) * els.globe.clientHeight;
  const behind = projected.z > 1;
  els.eventPopup.classList.toggle("occluded", behind);
  els.eventPopup.style.left = `${Math.max(150, Math.min(els.globe.clientWidth - 150, x))}px`;
  els.eventPopup.style.top = `${Math.max(60, Math.min(els.globe.clientHeight - 170, y - 132))}px`;
}

function closeSelectedPopup() {
  state.selectedId = null;
  renderPopup(null);
  renderDetailPanel(null);
  els.selectedTelemetry.textContent = "None";
  renderFeed();
}

function selectEvent(id, focusCamera = false) {
  const event = state.events.find((item) => item.id === id);
  if (!event) return;
  state.selectedId = id;
  els.selectedTelemetry.textContent = event.title.slice(0, 28);
  renderPopup(event);
  renderDetailPanel(event);
  renderFeed();

  if (focusCamera) {
    const destination = latLngToVector3(event.lat, event.lon, 5.2);
    camera.position.lerp(destination, 0.55);
    controls.target.set(0, 0, 0);
  }
}

/* === Per-type alert sound synthesis (Web Audio) ===
 * Each event type gets a distinct sonic signature so the operator can
 * recognise what kind of signal arrived without looking at the screen. */
function ensureAudio() {
  if (!state.audio) {
    try {
      state.audio = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {
      return null;
    }
  }
  // Browsers suspend AudioContext until a user gesture — try to resume
  if (state.audio.state === "suspended") {
    state.audio.resume().catch(() => {});
  }
  return state.audio;
}

// Unlock the AudioContext on first user gesture (sound is ON by default,
// but browsers refuse to play until the page has been interacted with).
function attachAudioUnlock() {
  const unlock = () => {
    state.audioUnlocked = true;
    ensureAudio();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

function playTone(opts) {
  const ctx = ensureAudio();
  if (!ctx || !state.soundEnabled) return;
  const {
    type = "sine",
    startFreq = 600,
    endFreq = 600,
    startTime = 0,
    duration = 0.25,
    attack = 0.01,
    release = 0.12,
    volume = 0.12,
    detune = 0,
  } = opts;
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
  if (detune) osc.detune.value = detune;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0002), now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + release);
}

function playNoiseBurst(opts) {
  const ctx = ensureAudio();
  if (!ctx || !state.soundEnabled) return;
  const { duration = 0.3, volume = 0.08, lowpass = 1800 } = opts;
  const now = ctx.currentTime;
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
  src.start(now);
  src.stop(now + duration);
}

// Each event "kind" maps to a distinct sonic signature
const ALERT_SOUNDS = {
  // High-priority urgent triple-beep
  "breaking-news": () => {
    playTone({ type: "square", startFreq: 980, endFreq: 980, duration: 0.08, volume: 0.10, startTime: 0 });
    playTone({ type: "square", startFreq: 1320, endFreq: 1320, duration: 0.08, volume: 0.10, startTime: 0.12 });
    playTone({ type: "sine",  startFreq: 1760, endFreq: 880,  duration: 0.22, volume: 0.10, startTime: 0.28 });
  },
  // Soft rising arpeggio for a new video
  "video": () => {
    playTone({ type: "triangle", startFreq: 660,  endFreq: 660,  duration: 0.10, volume: 0.07, startTime: 0 });
    playTone({ type: "triangle", startFreq: 880,  endFreq: 880,  duration: 0.10, volume: 0.07, startTime: 0.10 });
    playTone({ type: "triangle", startFreq: 1175, endFreq: 1175, duration: 0.16, volume: 0.08, startTime: 0.20 });
  },
  // Warning sweep for weather
  "weather": () => {
    playTone({ type: "sawtooth", startFreq: 540, endFreq: 820, duration: 0.32, volume: 0.08 });
    playTone({ type: "sawtooth", startFreq: 820, endFreq: 540, duration: 0.32, volume: 0.08, startTime: 0.35 });
  },
  // Deep rumble for earthquake
  "earthquake": () => {
    playTone({ type: "sine", startFreq: 130, endFreq: 70, duration: 0.55, volume: 0.16 });
    playNoiseBurst({ duration: 0.55, volume: 0.05, lowpass: 280 });
  },
  // Urgent klaxon-ish for disasters / NHC storms
  "disaster": () => {
    for (let i = 0; i < 3; i++) {
      playTone({ type: "square", startFreq: 700, endFreq: 900, duration: 0.12, volume: 0.11, startTime: i * 0.18 });
    }
  },
  // Spacey shimmer for space weather / solar flares
  "space-weather": () => {
    playTone({ type: "sine",     startFreq: 1400, endFreq: 2200, duration: 0.30, volume: 0.07 });
    playTone({ type: "triangle", startFreq: 1700, endFreq: 2600, duration: 0.30, volume: 0.05, startTime: 0.05 });
  },
  // Quick radar ping for aircraft
  "aircraft": () => {
    playTone({ type: "sine", startFreq: 2400, endFreq: 1200, duration: 0.14, volume: 0.08 });
  },
  // High blip for satellite
  "satellite": () => {
    playTone({ type: "sine", startFreq: 1800, endFreq: 2400, duration: 0.12, volume: 0.07 });
    playTone({ type: "sine", startFreq: 2400, endFreq: 1800, duration: 0.12, volume: 0.06, startTime: 0.14 });
  },
  // Subtle shutter for camera
  "camera": () => {
    playNoiseBurst({ duration: 0.05, volume: 0.07, lowpass: 5000 });
    playTone({ type: "sine", startFreq: 600, endFreq: 600, duration: 0.06, volume: 0.05, startTime: 0.04 });
  },
  // Natural events (fires, volcanoes)
  "natural": () => {
    playNoiseBurst({ duration: 0.4, volume: 0.05, lowpass: 1100 });
    playTone({ type: "sawtooth", startFreq: 220, endFreq: 130, duration: 0.4, volume: 0.07 });
  },
  // Air quality — gentle two-tone
  "air-quality": () => {
    playTone({ type: "triangle", startFreq: 520, endFreq: 520, duration: 0.18, volume: 0.06 });
    playTone({ type: "triangle", startFreq: 780, endFreq: 780, duration: 0.18, volume: 0.06, startTime: 0.20 });
  },
  // Ocean / marine — low rolling
  "ocean": () => {
    playTone({ type: "sine", startFreq: 180, endFreq: 230, duration: 0.6, volume: 0.10 });
  },
  // Generic fallback
  "default": () => {
    playTone({ type: "sine", startFreq: 720, endFreq: 480, duration: 0.20, volume: 0.10 });
  },
};

function playAlertSound(kindOrSeverity = "default") {
  const fn = ALERT_SOUNDS[kindOrSeverity] || ALERT_SOUNDS.default;
  try { fn(); } catch (_) { /* AudioContext might still be suspended */ }
}

/* === Live AI voice agent (Web Speech API) ===
 * When enabled, reads breaking-news popup headlines aloud — and ONLY popup
 * headlines, not every news refresh. Picks the best available English female
 * voice on the user's OS (Samantha on macOS, Zira on Windows, etc.) */
function pickPreferredVoice() {
  if (!("speechSynthesis" in window)) return null;
  if (state.voicePreferred && state.voicePreferred.voiceURI) return state.voicePreferred;
  const voices = speechSynthesis.getVoices() || [];
  const isBritish = (v) => /^en-GB/i.test(v.lang || "") || /UK|British|United Kingdom/i.test(v.name || "");
  const british = voices.filter(isBritish);
  // Order of preference for British voices — news-anchor quality first:
  //   Daniel = classic deep BBC-style male
  //   Kate / Serena / Hazel / Eva / Susan = polished RP female (varies by OS)
  //   Shelley / Sandy / Flo = modern British female alternatives (macOS Sonoma+)
  const britishPref = [
    /\bDaniel\b/i, /\bKate\b/i, /\bSerena\b/i, /\bHazel\b/i, /\bEva\b/i, /\bSusan\b/i,
    /\bShelley\b/i, /\bSandy\b/i, /\bFlo\b/i, /\bReed\b/i,
    /Google\s+UK\s+English/i, /\bGeorge\b/i,
  ];
  for (const re of britishPref) {
    const hit = british.find((v) => re.test(v.name) || re.test(v.voiceURI || ""));
    if (hit) { state.voicePreferred = hit; return hit; }
  }
  // Any en-GB voice
  if (british.length) { state.voicePreferred = british[0]; return british[0]; }
  // Fall back to other commonwealth English (Irish / Australian) — still British-tinged
  const commonwealth = voices.filter((v) => /^en-(IE|AU|ZA)/i.test(v.lang || ""));
  if (commonwealth.length) { state.voicePreferred = commonwealth[0]; return commonwealth[0]; }
  // Last resort — any English voice
  const en = voices.filter((v) => (v.lang || "").toLowerCase().startsWith("en"));
  if (en.length) { state.voicePreferred = en[0]; return en[0]; }
  return null;
}

// Track EVERY voice audio element ever created so we can guarantee a clean
// silence on stop. Multiple voices used to overlap because:
//  1. Cancelling an audio via src="" fired an error → SpeechSynthesis fallback
//     spoke the OLD headline simultaneously with the NEW audio
//  2. If play() resolved late, the audio could start playing AFTER we thought
//     we'd cancelled it
// Using a Set + per-handle suppress flag closes both gaps.
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
  // Cancel any in-flight SpeechSynthesis utterance from a previous fallback.
  if ("speechSynthesis" in window) {
    try { speechSynthesis.cancel(); } catch (_) {}
  }
}

function speakHeadline(text) {
  if (!state.voiceEnabled) return;
  if (!text) return;
  const phrase = `Breaking news. ${text}`;
  // Always silence everything before starting a new utterance.
  stopActiveVoice();
  // Primary path: Google en-GB female TTS via our /api/tts proxy.
  try {
    const audio = new Audio(`/api/tts?lang=en-GB&text=${encodeURIComponent(phrase)}`);
    audio.volume = 0.9;
    const handle = { audio, suppressFallback: false };
    liveVoiceAudios.add(handle);
    const cleanup = () => liveVoiceAudios.delete(handle);
    audio.addEventListener("ended", cleanup, { once: true });
    audio.addEventListener("error", () => {
      cleanup();
      if (handle.suppressFallback) return;
      handle.suppressFallback = true;
      fallbackSpeak(phrase);
    }, { once: true });
    audio.play().catch(() => {
      if (handle.suppressFallback) return;
      handle.suppressFallback = true;
      fallbackSpeak(phrase);
    });
  } catch (_) {
    fallbackSpeak(phrase);
  }
}

function fallbackSpeak(phrase) {
  if (!state.voiceEnabled) return; // guard — never speak if user toggled off
  if (!("speechSynthesis" in window)) return;
  try {
    const utter = new SpeechSynthesisUtterance(phrase);
    utter.rate = 1.02;
    utter.pitch = 1.0;
    utter.volume = 0.9;
    const v = pickPreferredVoice();
    if (v) utter.voice = v;
    speechSynthesis.cancel();
    speechSynthesis.speak(utter);
  } catch (_) { /* swallow — TTS support varies by browser */ }
}

function setVoiceEnabled(on) {
  state.voiceEnabled = !!on;
  localStorage.setItem("matrix.voiceEnabled", on ? "1" : "0");
  if (els.voiceToggle) {
    const span = els.voiceToggle.querySelector("span:last-child");
    if (span) span.textContent = on ? "JARVIS On" : "JARVIS";
    els.voiceToggle.classList.toggle("voice-on", on);
    els.voiceToggle.setAttribute("aria-pressed", String(on));
  }
  if (on) {
    // The toggle click is the user gesture browsers require before audio.
    jarvisSpeak("Voice protocols engaged, sir. I'll announce breaking developments as they arrive.");
  } else {
    stopActiveVoice();
  }
}

function flashMarker(event) {
  const marker = state.markers.get(event.id);
  if (!marker) return;
  marker.userData.flashUntil = performance.now() + 1600;
}

function announceEvent(event) {
  if (!event || !state.activeLayers.has(event.layer)) return;
  selectEvent(event.id);
  flashMarker(event);
  // Use the event's layer as the sound key (earthquake, weather, disaster, ...)
  playAlertSound(event.layer || "default");
}

function processNewAlerts(events) {
  const now = Date.now();
  const newEvents = events.filter((event) => !state.seenEventIds.has(event.id));
  events.forEach((event) => state.seenEventIds.add(event.id));
  if (now < state.popupArmedAt) return;
  const candidate = newEvents
    .filter((event) => state.activeLayers.has(event.layer) && isAutoPopupCandidate(event, now))
    .sort((a, b) => {
      const severityScore = { high: 3, medium: 2, low: 1 };
      return (severityScore[b.severity] ?? 0) - (severityScore[a.severity] ?? 0) || eventTimestamp(b.time) - eventTimestamp(a.time);
    })[0];
  if (candidate) announceEvent(candidate);
}

function renderAll() {
  renderLayers();
  syncMarkers();
  renderFeed();
  if (state.selectedId && !state.markers.has(state.selectedId)) {
    renderPopup(null);
  }
}

function modeStatusText(mode) {
  return mode === "cameras"
    ? "Camera layer selected"
    : mode === "signals"
      ? "Signal layers selected"
      : mode === "timeline"
        ? "Timeline view selected"
        : "Live feeds online";
}

function setMode(mode) {
  state.mode = mode;
  const modeLayers = {
    live: layers.map((layer) => layer.id),
    timeline: ["earthquake", "disaster", "natural", "space-weather", "weather", "air-quality", "ocean"],
    signals: ["aircraft", "satellite", "space-weather", "weather", "air-quality", "ocean"],
    cameras: ["camera"],
  };
  state.activeLayers = new Set(modeLayers[mode] ?? modeLayers.live);
  els.commandTabs.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const labels = {
    live: "Live Fusion",
    timeline: "Timeline",
    signals: "Signals",
    cameras: "Cameras",
  };
  els.modeTelemetry.textContent = labels[mode] ?? "Live Fusion";
  els.feedState.textContent = modeStatusText(mode);
  renderAll();
  renderTelemetry();
}

async function loadEvents() {
  els.feedState.textContent = "Updating live intelligence feeds";

  // Helper: fetch with a wall-clock timeout. If any single endpoint hangs (e.g.
  // /api/satellites when the TLE upstream is slow), it must NOT block the rest of
  // the dashboard. Each call resolves to null on timeout/failure and downstream
  // code falls back to empty payloads.
  const safeFetch = (url, ms) => Promise.race([
    fetch(url).catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), ms)),
  ]);

  const [response, satelliteResponse, cameraResponse, newsResponse, intelResponse] = await Promise.all([
    safeFetch(`/api/events?ts=${Date.now()}`, 45000),
    safeFetch(`/api/satellites?ts=${Date.now()}`, 12000),
    safeFetch(`/api/cameras?ts=${Date.now()}`, 8000),
    safeFetch(`/api/news?ts=${Date.now()}`, 12000),
    safeFetch(`/api/intel?ts=${Date.now()}`, 12000),
  ]);
  // Events may fail/timeout on a cold load — degrade gracefully instead of
  // throwing, so cameras / news / intel still render (cameras-only is the
  // default view, so cameras must NOT depend on the slow /api/events call).
  const payload = response && response.ok ? await response.json() : { events: state.baseEvents || [], sources: [] };
  const satellitePayload = satelliteResponse && satelliteResponse.ok ? await satelliteResponse.json() : { satellites: state.satelliteTles || [], sources: [] };
  const cameraPayload = cameraResponse && cameraResponse.ok ? await cameraResponse.json() : { cameras: state.cameras || [], sources: [] };
  const newsPayload = newsResponse && newsResponse.ok ? await newsResponse.json() : { items: [], sources: [] };
  const intelPayload = intelResponse && intelResponse.ok ? await intelResponse.json() : { widgets: state.intel || [], sources: [] };
  state.baseEvents = payload.events || [];
  state.satelliteTles = satellitePayload.satellites ?? [];
  state.cameras = cameraPayload.cameras ?? [];
  // Only process news if we actually fetched it (else keep what pollNews has).
  if (newsResponse && newsResponse.ok) {
    detectBreakingNews(newsPayload.items ?? []);
  }
  state.intel = intelPayload.widgets ?? [];
  computeSatelliteEvents();
  state.events = [...state.baseEvents, ...state.satelliteEvents];
  const totalSources = (payload.sources?.length ?? 0)
    + (satellitePayload.sources?.length ?? 0)
    + (cameraPayload.sources?.length ?? 0)
    + (newsPayload.sources?.length ?? 0)
    + (intelPayload.sources?.length ?? 0);
  if (els.sourceCount) els.sourceCount.textContent = totalSources;
  if (els.hudSourceCount) els.hudSourceCount.textContent = `${totalSources} src · ${state.events.length} signals`;
  if (els.brandSub) els.brandSub.textContent = `Fusing ${totalSources} open intelligence sources in real time`;
  if (els.lastUpdated) els.lastUpdated.textContent = formatTime(payload.updated_at);
  if (els.feedState) els.feedState.textContent = modeStatusText(state.mode);
  setCounter(els.mSources, totalSources);
  renderCameras();
  renderNews();
  renderIntel();
  renderAll();
  renderTelemetry();
  processNewAlerts(state.events);
  addActivity("sync", `Feeds synced · ${totalSources} sources · ${state.events.length} signals`);
}

function renderTelemetry() {
  const counts = Object.fromEntries(layers.map((layer) => [layer.id, 0]));
  for (const event of state.events) {
    if (counts[event.layer] !== undefined) counts[event.layer] += 1;
  }
  els.aircraftTelemetry.textContent = `${counts.aircraft ?? 0} tracked`;
  els.satelliteTelemetry.textContent = `${counts.satellite ?? 0} on orbit`;
  els.cameraTelemetry.textContent = `${counts.camera ?? 0} feeds`;
  els.seismicTelemetry.textContent = `${counts.earthquake ?? 0} quakes`;
  const environmentalSignals = (counts.weather ?? 0) + (counts["air-quality"] ?? 0) + (counts.ocean ?? 0);
  els.weatherTelemetry.textContent = `${environmentalSignals} env`;
}

function computeSatelliteEvents() {
  const now = new Date();
  const gmstValue = gstime(now);
  state.satelliteEvents = state.satelliteTles.slice(0, 100).map((tle, index) => {
    try {
      const satrec = twoline2satrec(tle.line1, tle.line2);
      const positionAndVelocity = propagate(satrec, now);
      if (!positionAndVelocity.position) return null;
      const geodetic = eciToGeodetic(positionAndVelocity.position, gmstValue);
      const lat = degreesLat(geodetic.latitude);
      const lon = degreesLong(geodetic.longitude);
      const altitude = geodetic.height;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return {
        id: `satellite-${tle.name}-${index}`,
        layer: "satellite",
        source: "CelesTrak",
        title: `${tle.name}`,
        summary: `Satellite subpoint. Approximate altitude ${Math.round(altitude)} km from current TLE propagation.`,
        severity: "low",
        time: now.toISOString(),
        lat,
        lon,
        url: "https://celestrak.org/",
        details: {
          "Satellite": tle.name,
          "Altitude": `${Math.round(altitude)} km`,
          "TLE line 1": tle.line1.slice(0, 24),
          "TLE line 2": tle.line2.slice(0, 24),
          "Updated": now.toISOString(),
        },
      };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function resize() {
  const { clientWidth, clientHeight } = els.globe;
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / Math.max(clientHeight, 1);
  camera.updateProjectionMatrix();
}

function tickClock() {
  const now = new Date();
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  if (els.globeClock) els.globeClock.textContent = `${hh}:${mm}:${ss} UTC`;
  if (els.headerClock) els.headerClock.textContent = `${hh}:${mm}:${ss}`;
}

function animate(time) {
  requestAnimationFrame(animate);
  const nowp = performance.now();

  // Globe rotation: when a news flag drops we focus-spin the globe to face it
  // (and pause auto-rotate briefly); otherwise auto-rotate as usual.
  if (state.rotFocus && state.rotFocus.animating) {
    const cur = globeGroup.rotation.y;
    let delta = (state.rotFocus.target - cur) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    globeGroup.rotation.y = cur + delta * 0.14;
    if (Math.abs(delta) < 0.008) {
      globeGroup.rotation.y = state.rotFocus.target;
      state.rotFocus.animating = false;
    }
  } else if (state.autoRotate && (!state.rotFocus || nowp > state.rotFocus.resumeAutoAt)) {
    globeGroup.rotation.y += 0.0009;
  }

  // Camera dolly: zoom IN to the news location, hold, then pull back OUT.
  if (state.camFocus) {
    const f = state.camFocus;
    const len = camera.position.length();
    if (f.phase === "in") {
      const next = len + (GLOBE_ZOOM_DIST - len) * 0.07;
      camera.position.setLength(next);
      if (Math.abs(next - GLOBE_ZOOM_DIST) < 0.03) {
        camera.position.setLength(GLOBE_ZOOM_DIST);
        f.phase = "hold";
        f.holdUntil = nowp + GLOBE_ZOOM_HOLD_MS;
      }
    } else if (f.phase === "hold") {
      if (nowp > f.holdUntil) f.phase = "out";
    } else if (f.phase === "out") {
      const next = len + (GLOBE_HOME_DIST - len) * 0.05;
      camera.position.setLength(next);
      if (Math.abs(next - GLOBE_HOME_DIST) < 0.04) {
        camera.position.setLength(GLOBE_HOME_DIST);
        state.camFocus = null;
      }
    }
  }
  markerGroup.rotation.y = globeGroup.rotation.y;
  newsFlagGroup.rotation.y = globeGroup.rotation.y;

  // Expire + animate AI news flagpoles
  if (newsFlags.length) {
    for (let i = newsFlags.length - 1; i >= 0; i--) {
      const f = newsFlags[i];
      if (f.until < nowp) {
        f.dispose();
        newsFlags.splice(i, 1);
        continue;
      }
      // Raise-in animation (first 500ms) + gentle fade-out in the last 1.2s
      const age = nowp - f.raisedAt;
      const remain = f.until - nowp;
      const rise = Math.min(1, age / 500);
      const fade = Math.min(1, remain / 1200);
      f.group.scale.setScalar(rise);
      f.group.children.forEach((child) => {
        if (child.material && "opacity" in child.material && !child.isSprite) {
          child.material.opacity = fade * (child.material.userData?.baseOpacity ?? 0.95);
          child.material.transparent = true;
        } else if (child.isSprite) {
          child.material.opacity = fade;
        }
      });
      // Pulse the base bead like a beacon
      if (f.bead) {
        const p = 1 + Math.sin(nowp * 0.012) * 0.35;
        f.bead.scale.setScalar(p);
      }
    }
  }

  // Constant on-screen icon size regardless of zoom.
  // A sprite of fixed WORLD size grows on screen as the camera approaches
  // (screen_size ∝ world_size / distance). To hold screen_size constant we
  // scale the marker proportional to the camera→origin distance, so
  // world_size/distance stays fixed. REF is the default camera distance.
  const REF_CAM_DISTANCE = 5.8;
  const zoomScale = camera.position.length() / REF_CAM_DISTANCE;

  for (const marker of state.markers.values()) {
    const isFlashing = marker.userData.flashUntil && marker.userData.flashUntil > time;
    const pulse = 1 + Math.sin(time * 0.008) * (isFlashing ? 0.22 : 0.03);
    marker.scale.setScalar(marker.userData.baseScale * pulse * zoomScale);
  }

  controls.update();
  updatePopupPosition();
  renderer.render(scene, camera);
}

function bindControls() {
  els.commandTabs.forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  els.allLayersButton.addEventListener("click", () => {
    state.activeLayers = new Set(layers.map((layer) => layer.id));
    persistLayers();
    renderAll();
  });

  if (els.noneLayersButton) {
    els.noneLayersButton.addEventListener("click", () => {
      state.activeLayers = new Set();
      persistLayers();
      renderAll();
    });
  }

  // Sources popover toggle
  if (els.sourcesButton && els.sourcesPopover) {
    const closeSources = () => {
      els.sourcesPopover.classList.add("hidden");
      els.sourcesButton.setAttribute("aria-expanded", "false");
      els.sourcesButton.classList.remove("active");
    };
    els.sourcesButton.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = els.sourcesPopover.classList.toggle("hidden");
      els.sourcesButton.setAttribute("aria-expanded", String(!open));
      els.sourcesButton.classList.toggle("active", !open);
    });
    // Click-away + Esc to close
    document.addEventListener("click", (e) => {
      if (els.sourcesPopover.classList.contains("hidden")) return;
      if (els.sourcesPopover.contains(e.target) || els.sourcesButton.contains(e.target)) return;
      closeSources();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeSources();
    });
  }

  // News scroll-speed control (interval in seconds; lower = faster)
  const applySpeed = (ms) => {
    state.newsScrollMs = Math.max(3000, Math.min(60000, ms));
    try { localStorage.setItem("matrix.newsScrollMs", String(state.newsScrollMs)); } catch (_) {}
    if (els.speedSlider) els.speedSlider.value = String(Math.round(state.newsScrollMs / 1000));
    if (els.speedVal) els.speedVal.textContent = `${Math.round(state.newsScrollMs / 1000)}s`;
    armNewsTicker();
  };
  if (els.speedSlider) {
    els.speedSlider.value = String(Math.round(state.newsScrollMs / 1000));
    if (els.speedVal) els.speedVal.textContent = `${Math.round(state.newsScrollMs / 1000)}s`;
    els.speedSlider.addEventListener("input", () => applySpeed(parseInt(els.speedSlider.value, 10) * 1000));
  }
  if (els.speedSlower) els.speedSlower.addEventListener("click", () => applySpeed(state.newsScrollMs + 3000));
  if (els.speedFaster) els.speedFaster.addEventListener("click", () => applySpeed(state.newsScrollMs - 3000));

  // Hero featured story → open in webview
  if (els.heroStory) {
    els.heroStory.addEventListener("click", (e) => {
      e.preventDefault();
      const d = els.heroStory.dataset;
      if (d.url || d.embed) openWebView({ url: d.embed || d.url, externalUrl: d.url, source: d.source, title: d.title });
    });
  }

  els.refreshButton.addEventListener("click", () => {
    loadEvents().catch((error) => {
      if (els.feedState) els.feedState.textContent = error.message;
    });
  });

  els.fullscreenButton.addEventListener("click", async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      els.fullscreenButton.title = "Exit full screen";
    } else {
      await document.exitFullscreen();
      els.fullscreenButton.title = "Full screen";
    }
    setTimeout(resize, 250);
  });

  if (els.autoRotateButton) {
    els.autoRotateButton.addEventListener("click", () => {
      state.autoRotate = !state.autoRotate;
      const s = els.autoRotateButton.querySelector("span:last-child");
      if (s) s.textContent = state.autoRotate ? "Pause Rotate" : "Rotate";
      els.autoRotateButton.setAttribute("aria-pressed", String(state.autoRotate));
    });
  }

  // Sound is ON by default; reflect that in the button + chrome state
  const soundLabel = els.soundToggle.querySelector("span:last-child");
  if (soundLabel) soundLabel.textContent = "Sound On";
  els.soundToggle.setAttribute("aria-pressed", "true");
  els.soundToggle.classList.add("sound-on");
  els.soundToggle.addEventListener("click", async () => {
    state.audio ??= new (window.AudioContext || window.webkitAudioContext)();
    try { await state.audio.resume(); } catch (_) {}
    state.soundEnabled = !state.soundEnabled;
    const sl = els.soundToggle.querySelector("span:last-child");
    if (sl) sl.textContent = state.soundEnabled ? "Sound On" : "Sound Off";
    els.soundToggle.setAttribute("aria-pressed", String(state.soundEnabled));
    els.soundToggle.classList.toggle("sound-on", state.soundEnabled);
    if (state.soundEnabled) playAlertSound("breaking-news");
  });

  window.addEventListener("resize", resize);

  // Distinguish a true click from a drag-rotate. Only a real click should hit a marker
  // — or close the popup when it lands on empty space.
  let pointerDownAt = null;
  renderer.domElement.addEventListener("pointerdown", (event) => {
    pointerDownAt = { x: event.clientX, y: event.clientY, t: performance.now() };
  });
  renderer.domElement.addEventListener("pointerup", (event) => {
    if (!pointerDownAt) return;
    const dx = Math.abs(event.clientX - pointerDownAt.x);
    const dy = Math.abs(event.clientY - pointerDownAt.y);
    const dt = performance.now() - pointerDownAt.t;
    pointerDownAt = null;
    if (dx > 5 || dy > 5 || dt > 600) return; // it was a drag or long-press, ignore

    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(state.markerObjects, false);
    if (hits.length) {
      const eventId = hits[0].object.userData.eventId;
      if (eventId) selectEvent(eventId, false);
    } else {
      // Click in open space → close the selected event popup + detail
      closeSelectedPopup();
    }
  });

  // Globe hover tooltip
  let hoverRaf = 0;
  let lastHoverX = 0;
  let lastHoverY = 0;
  renderer.domElement.addEventListener("pointermove", (event) => {
    lastHoverX = event.clientX;
    lastHoverY = event.clientY;
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((lastHoverX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((lastHoverY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(state.markerObjects, false);
      if (hits.length) {
        const eventId = hits[0].object.userData.eventId;
        const hovered = state.events.find((ev) => ev.id === eventId);
        if (hovered) {
          showMapTooltip(hovered, lastHoverX, lastHoverY);
          renderer.domElement.style.cursor = "pointer";
          return;
        }
      }
      hideMapTooltip();
      renderer.domElement.style.cursor = "grab";
    });
  });

  renderer.domElement.addEventListener("pointerleave", hideMapTooltip);

  // Esc closes the selected event popup too
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.selectedId) {
      closeSelectedPopup();
    }
  });

  // Webview close button
  if (els.webViewClose) {
    els.webViewClose.addEventListener("click", closeWebView);
  }

  // AI Voice toggle — reads breaking-news popup headlines aloud
  if (els.voiceToggle) {
    // Restore saved state
    setVoiceEnabled(state.voiceEnabled);
    els.voiceToggle.addEventListener("click", () => setVoiceEnabled(!state.voiceEnabled));
    // SpeechSynthesis voices load async — warm them up early
    if ("speechSynthesis" in window) {
      speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener?.("voiceschanged", () => pickPreferredVoice());
    }
  }
  // Esc also closes the webview (in addition to selected event popup)
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.webView && els.webView.classList.contains("open")) {
      closeWebView();
    }
  });
}

/* Dedicated YouTube video poller (every 15 min).
 * AI clips ONLY — POE2 / gaming has been removed entirely.
 * Flags any never-seen video IDs as "fresh" so they slide in with the
 * is-new flash + JUST IN badge. */
async function pollYouTubeVideos(opts = {}) {
  try {
    const aiRes = await fetch(`/api/videos/ai?ts=${Date.now()}`);
    if (aiRes.ok) {
      const payload = await aiRes.json();
      const incoming = payload.items ?? [];
      const newIds = opts.bootstrap
        ? new Set()
        : new Set(incoming.filter((v) => !state.seenVideoIds.has(v.id)).map((v) => v.id));
      incoming.forEach((v) => state.seenVideoIds.add(v.id));
      if (newIds.size > 0) {
        state.freshVideoIds = new Set([...state.freshVideoIds, ...newIds]);
        playAlertSound("video");
        incoming.filter((v) => newIds.has(v.id)).forEach((v) => addActivity("video", `${v.source}: ${v.title}`, { ...v, _isVideo: true }));
        setTimeout(() => {
          newIds.forEach((id) => state.freshVideoIds.delete(id));
          renderNews();
        }, 6000);
      }
      state.aiVideos = incoming;
      renderNews();
    }
  } catch (_) {
    /* ignore transient failures */
  }
}

/* Dedicated newswire poller (faster than full refresh) */
async function pollNews() {
  try {
    const [newsRes, intelRes] = await Promise.all([
      fetch(`/api/news?ts=${Date.now()}`),
      fetch(`/api/intel?ts=${Date.now()}`),
    ]);
    if (newsRes.ok) {
      const newsPayload = await newsRes.json();
      const incomingNews = newsPayload.items ?? [];
      detectBreakingNews(incomingNews); // updates state.news internally
      renderNews();
    }
    if (intelRes.ok) {
      const intelPayload = await intelRes.json();
      state.intel = intelPayload.widgets ?? [];
      renderIntel();
    }
  } catch (_) {
    /* ignore transient failures */
  }
}

bindControls();
resize();
requestAnimationFrame(animate);
renderLayers(); // populate the Sources popover immediately (before data loads)
loadCountryTexture();
loadEvents().catch((error) => {
  els.feedState.textContent = "Live feeds unavailable";
  els.alertFeed.innerHTML = `<article class="alert-card"><div class="alert-title"><span class="mini-icon">!</span><h2>Feed error</h2></div><p>${error.message}</p></article>`;
});
setInterval(() => loadEvents().catch(() => {}), 60000);
setInterval(() => {
  if (!state.satelliteTles.length) return;
  computeSatelliteEvents();
  state.events = [...state.baseEvents, ...state.satelliteEvents];
  renderAll();
  renderTelemetry();
}, 15000);
tickClock();
setInterval(tickClock, 1000);
setInterval(pollNews, 25000); // dedicated newswire poll: every 25s
pollYouTubeVideos({ bootstrap: true });
setInterval(pollYouTubeVideos, 15 * 60 * 1000); // YouTube videos every 15 min
startNewsTicker();
attachAudioUnlock();
// New desk feeds
pollStock();
setInterval(pollStock, 60 * 1000);              // TSLA quote + chart every 60s
pollSocial({ bootstrap: true });
setInterval(pollSocial, 2 * 60 * 1000);         // social pulse every 2 min
pollAiPulse();
setInterval(pollAiPulse, 10 * 60 * 1000);       // research pulse every 10 min
initActivityClicks();
initJarvis();

/* === Welcome modal + intro music ===
 * On first session load, show a centered welcome modal with an OK button.
 * The OK click is the user gesture that unlocks audio playback, so the
 * intro MP3 starts the moment the modal dismisses. Once per browser
 * session (sessionStorage). */
const INTRO_TRACK_URL = "/assets/intro.mp3";
const INTRO_PLAYED_KEY = "matrix.introPlayed";

let introAudio = null;

function playIntroTrack() {
  if (introAudio) return;
  introAudio = new Audio(INTRO_TRACK_URL);
  introAudio.volume = 0.75;
  introAudio.preload = "auto";
  introAudio.addEventListener("ended", () => { introAudio = null; });
  introAudio.play().catch(() => { /* if blocked, give up silently */ });
  sessionStorage.setItem(INTRO_PLAYED_KEY, "1");
}

function showWelcomeModal() {
  if (sessionStorage.getItem(INTRO_PLAYED_KEY) === "1") return;
  const backdrop = document.querySelector("#welcomeBackdrop");
  const okBtn = document.querySelector("#welcomeOk");
  if (!backdrop || !okBtn) return;
  backdrop.classList.remove("hidden");
  // next frame so the transition triggers
  requestAnimationFrame(() => backdrop.classList.add("visible"));

  const dismiss = () => {
    okBtn.removeEventListener("click", dismiss);
    document.removeEventListener("keydown", onKey);
    // Play the intro NOW — this synchronous click is the user gesture
    // browsers require before audio.play() will work.
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
  // Give focus to the OK button so Enter dismisses immediately
  setTimeout(() => okBtn.focus(), 100);
}

// Show the welcome modal on first paint
showWelcomeModal();
