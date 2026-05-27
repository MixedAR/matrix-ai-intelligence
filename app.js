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
  activeLayers: new Set(layers.map((layer) => layer.id)),
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
  seenNewsIds: new Set(),
  freshNewsIds: new Set(),
  breakingTimer: null,
  newsBootstrapped: false,
  hoveredEventId: null,
  pendingNews: [], // items waiting to be promoted to the rail (one is on screen as BREAKING)
  rawNews: [],      // full server-fetched list, used to compose visible state.news
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
};

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x04070d, 6.5, 14);

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
scene.add(globeGroup, markerGroup);
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

function makeGlobeTexture(countries = null) {
  const canvas = document.createElement("canvas");
  canvas.width = 4096;
  canvas.height = 2048;
  const ctx = canvas.getContext("2d");
  const ocean = ctx.createLinearGradient(0, 0, 0, canvas.height);
  ocean.addColorStop(0, "#081e2e");
  ocean.addColorStop(0.52, "#0a1f2a");
  ocean.addColorStop(1, "#040d18");
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid
  ctx.strokeStyle = "rgba(120, 170, 200, 0.10)";
  ctx.lineWidth = 1.5;
  for (let x = 0; x <= canvas.width; x += canvas.width / 36) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += canvas.height / 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  if (countries?.features?.length) {
    ctx.fillStyle = "rgba(30, 86, 70, 0.92)";
    ctx.strokeStyle = "rgba(199, 237, 225, 0.42)";
    ctx.lineWidth = 2;
    countries.features.forEach((feature) => {
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
    });

    ctx.strokeStyle = "rgba(180, 230, 240, 0.55)";
    ctx.lineWidth = 1.4;
    countries.features.forEach((feature) => {
      forEachRingCoordinates(feature.geometry, (ring) => drawRing(ctx, ring, canvas.width, canvas.height));
    });

    ctx.font = "700 26px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(220, 245, 245, 0.78)";
    ctx.strokeStyle = "rgba(4, 11, 15, 0.92)";
    ctx.lineWidth = 5;
    countries.features.forEach((feature) => {
      const point = geometryLabelPoint(feature.geometry);
      const name = feature.properties?.name;
      if (!point || !name || point.span < 8) return;
      const [x, y] = projectionPoint(point.lon, point.lat, canvas.width, canvas.height);
      ctx.strokeText(name, x, y);
      ctx.fillText(name, x, y);
    });
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  for (let i = 0; i < 600; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const r = Math.random() * 1.3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const earth = new THREE.Mesh(
  new THREE.SphereGeometry(2, 96, 96),
  new THREE.MeshStandardMaterial({
    map: makeGlobeTexture(),
    roughness: 0.86,
    metalness: 0.08,
    emissive: new THREE.Color(0x05101a),
    emissiveIntensity: 0.42,
  }),
);
globeGroup.add(earth);

async function loadCountryTexture() {
  try {
    const response = await fetch(`countries.geojson?ts=${Date.now()}`);
    if (!response.ok) throw new Error("country geometry unavailable");
    const countries = await response.json();
    earth.material.map = makeGlobeTexture(countries);
    earth.material.needsUpdate = true;
  } catch (error) {
    console.warn(error.message);
  }
}

const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(2.05, 96, 96),
  new THREE.MeshBasicMaterial({ color: 0x43e8d8, transparent: true, opacity: 0.09, side: THREE.BackSide }),
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
      depthTest: false,
      depthWrite: false,
    }),
  );
  const iconSize = event.layer === "aircraft" ? 0.072 : event.layer === "satellite" ? 0.062 : event.layer === "camera" ? 0.074 : 0.078;
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
          depthTest: false,
          depthWrite: false,
        }),
      );
      label.scale.set(0.11, 0.028, 1);
      label.position.set(0, -0.05, 0);
      label.userData.eventId = event.id;
      group.add(label);
    }
  }

  group.userData = { event, marker: icon, baseScale: event.severity === "high" ? 1.15 : 1 };
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
      renderAll();
    });
  });
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
function videoCardHtml(item, freshSet) {
  const isNew = freshSet && freshSet.has(item.id) ? "is-new" : "";
  const cls = item.category === "gaming-video" ? "gaming-video" : "ai-video";
  const thumb = item.thumbnail || `https://i.ytimg.com/vi/${item.video_id}/hqdefault.jpg`;
  // YouTube embed URL plays inline in the webview iframe — videos always embed
  const embedUrl = item.video_id ? `https://www.youtube.com/embed/${item.video_id}?autoplay=1` : (item.url || "");
  return `
    <a class="video-card ${cls} ${isNew}" data-news-card="true" data-url="${item.url || ""}" data-embed="${embedUrl}" data-source="${(item.source || "").replace(/"/g, "&quot;")}" data-title="${(item.title || "").replace(/"/g, "&quot;")}" href="${item.url || "#"}" target="_blank" rel="noreferrer">
      <div class="video-thumb">
        <img src="${thumb}" alt="" loading="lazy">
        <div class="video-meta-overlay">
          <span class="video-source-pill">${item.source}</span>
          <span class="video-time-pill">${relativeTime(item.time)}</span>
        </div>
      </div>
      <div class="video-body">
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
    ? `<div class="news-card-thumb"><img src="${item.thumbnail}" alt="" loading="lazy" onerror="this.parentNode.parentNode.classList.add('no-image'); this.parentNode.remove();"></div>`
    : "";
  return `
    <a class="news-card cat-${item.category || "world"} ${noImage} ${isNew}" data-news-card="true" data-url="${item.url || ""}" data-source="${(item.source || "").replace(/"/g, "&quot;")}" data-title="${(item.title || "").replace(/"/g, "&quot;")}" href="${item.url || "#"}" target="_blank" rel="noreferrer">
      ${thumb}
      <div class="news-card-body">
        <div class="news-card-meta">
          <span>${item.source}</span>
          <span class="news-time">${relativeTime(item.time)}</span>
        </div>
        <h3>${item.title}</h3>
        <p>${item.summary || ""}</p>
      </div>
    </a>
  `;
}

const CARD_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2-hour rail TTL

function isFresh(item) {
  if (!item || !item.time) return false;
  const ts = eventTimestamp(item.time);
  if (!ts) return false;
  return Date.now() - ts < CARD_MAX_AGE_MS;
}

// Signature of the currently rendered rail so we can skip pointless rebuilds
// when polled data is identical to what's already on screen — eliminates the
// 25-second visual flicker the user reported.
let renderedNewsSignature = "";

function renderNews() {
  if (!els.newsTrack) return;
  if (els.railTitle) els.railTitle.textContent = "Breaking Newswire";

  // Single merged feed: news + AI videos + POE2 videos, all in last 2h, newest first
  const merged = [
    ...state.news,
    ...state.aiVideos.map((v) => ({ ...v, _isVideo: true })),
    ...state.gamingVideos.map((v) => ({ ...v, _isVideo: true })),
  ]
    .filter((i) => i && i.title && isFresh(i))
    .sort((a, b) => eventTimestamp(b.time) - eventTimestamp(a.time));

  if (!merged.length) {
    const emptySig = "EMPTY";
    if (renderedNewsSignature !== emptySig) {
      els.newsTrack.innerHTML = `<div class="rail-empty"><strong>Quiet window</strong>No news, AI uploads, or POE2 videos in the last 2 hours — polling continues every 25s for news, 15 min for videos.</div>`;
      renderedNewsSignature = emptySig;
    }
    els.newsMeta.textContent = `0 items · 2h window`;
    return;
  }
  const aiNewsCount = merged.filter((i) => !i._isVideo && i.category === "ai").length;
  const aiVideoCount = merged.filter((i) => i._isVideo && i.category === "ai-video").length;
  const gameCount = merged.filter((i) => i._isVideo && i.category === "gaming-video").length;
  const totalNews = merged.filter((i) => !i._isVideo).length;
  els.newsMeta.textContent = `${totalNews} stories · ${aiNewsCount + aiVideoCount} AI · ${gameCount} POE2 · 2h window`;
  els.newsTelemetry.textContent = `${merged.length} items`;

  // Signature: list of item IDs (rounded to nearest minute so "3m ago" → "4m ago"
  // does trigger a re-render once per minute, but identical polls don't).
  const slice = merged.slice(0, 50);
  const minuteBucket = Math.floor(Date.now() / 60000);
  const freshTag = `${state.freshNewsIds.size}:${state.freshVideoIds.size}`;
  const sig = `${minuteBucket}|${freshTag}|` + slice.map((i) => i.id).join(",");
  if (sig === renderedNewsSignature) return;
  renderedNewsSignature = sig;

  els.newsTrack.innerHTML = slice.map((item) => {
    if (item._isVideo) return videoCardHtml(item, state.freshVideoIds);
    return newsCardHtml(item);
  }).join("");
  bindCardClicks();
  if ((state.freshNewsIds.size > 0 || state.freshVideoIds.size > 0) && els.newsTrack.scrollTo) {
    els.newsTrack.scrollTo({ left: 0, behavior: "smooth" });
  }
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
const NEWS_STEP_INTERVAL_MS = 30000;

function startNewsTicker() {
  if (!els.newsTrack) return;
  els.newsTrack.addEventListener("pointerenter", () => { newsTickerHovered = true; });
  els.newsTrack.addEventListener("pointerleave", () => { newsTickerHovered = false; });

  setInterval(() => {
    if (newsTickerHovered) return;
    if (!state.news.length) return;
    const track = els.newsTrack;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    if (max <= 0) return;
    const firstCard = track.querySelector(".news-card");
    if (!firstCard) return;
    const cs = window.getComputedStyle(track);
    const gap = parseFloat(cs.columnGap || cs.gap || "10") || 10;
    const step = firstCard.offsetWidth + gap;
    let target = track.scrollLeft + step;
    if (target >= max - 4) {
      target = 0; // wrap back so newest is shown again
    }
    track.scrollTo({ left: target, behavior: "smooth" });
  }, NEWS_STEP_INTERVAL_MS);
}

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

function detectBreakingNews(items) {
  if (!items) return;
  state.rawNews = items;
  const isFirstLoad = !state.newsBootstrapped;
  const incoming = items.filter((item) => !state.seenNewsIds.has(item.id));
  items.forEach((item) => state.seenNewsIds.add(item.id));

  if (isFirstLoad) {
    state.newsBootstrapped = true;
    state.news = items;
    return;
  }

  if (incoming.length) {
    // Hold new items in the queue so they don't appear in the rail yet
    state.pendingNews.push(...incoming);
  }
  state.news = visibleNewsFromRaw();
  showNextBreakingPopup();
}

function showNextBreakingPopup() {
  if (!els.breakingPopup) return;
  if (state.breakingTimer) return; // popup already up
  if (!state.pendingNews.length) return;

  const item = state.pendingNews[0]; // peek; promoted on dismiss
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
  speakHeadline(item.title);
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
function openWebView({ url, externalUrl, source, title }) {
  if (!els.webView) return;
  if (!url) return;
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
    if (els.webViewFrame) els.webViewFrame.src = "about:blank";
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
}

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
  // Crypto and HN have moved to top bars — render those first
  renderCryptoBar();
  renderHnTicker();
  if (!state.intel.length) {
    els.intelPanel.innerHTML = `<div class="intel-card"><div class="intel-card-head">Loading intel</div></div>`;
    return;
  }
  // Sidebar only shows the non-relocated widgets
  const sidebarWidgets = state.intel.filter((w) => w.kind !== "crypto" && w.kind !== "hn");
  els.intelMeta.textContent = `${sidebarWidgets.length} live`;
  els.intelPanel.innerHTML = sidebarWidgets.map((widget) => {
    if (widget.kind === "crypto") {
      return `
        <div class="intel-card">
          <div class="intel-card-head">${widget.title}<small>${widget.source}</small></div>
          ${widget.items.map((c) => {
            const change = Number(c.change);
            const cls = change >= 0 ? "up" : "down";
            const sign = change >= 0 ? "+" : "";
            return `<div class="intel-row">
              <div><span class="sym">${c.symbol}</span><span class="name">${c.name}</span></div>
              <div><span class="val">$${formatPrice(c.price)}</span><span class="delta ${cls}">${sign}${change?.toFixed(2)}%</span></div>
            </div>`;
          }).join("")}
        </div>`;
    }
    if (widget.kind === "fx") {
      return `
        <div class="intel-card">
          <div class="intel-card-head">${widget.title}<small>${widget.source}</small></div>
          ${widget.items.map((r) => `
            <div class="intel-row">
              <div><span class="sym">${r.symbol}</span><span class="name">per USD</span></div>
              <div><span class="val">${Number(r.rate).toFixed(r.rate < 10 ? 4 : 2)}</span></div>
            </div>
          `).join("")}
        </div>`;
    }
    if (widget.kind === "hn") {
      return `
        <div class="intel-card">
          <div class="intel-card-head">${widget.title}<small>${widget.source}</small></div>
          ${widget.items.map((s) => `
            <a href="${s.url}" target="_blank" rel="noreferrer">${s.title}<span class="meta">${s.score || 0}▲ · ${s.descendants || 0}💬</span></a>
          `).join("")}
        </div>`;
    }
    if (widget.kind === "wiki") {
      return `
        <div class="intel-card">
          <div class="intel-card-head">${widget.title}<small>${widget.source}</small></div>
          ${widget.items.map((s) => `<a href="${s.url || "#"}" target="_blank" rel="noreferrer">${s.title}</a>`).join("")}
        </div>`;
    }
    if (widget.kind === "apod") {
      const item = widget.items[0] || {};
      const img = item.media_type === "image" && item.url ? `<img src="${item.url}" alt="${item.title || ""}" loading="lazy">` : "";
      return `
        <div class="intel-card">
          <div class="intel-card-head">${widget.title}<small>${item.date || ""}</small></div>
          ${img}
          <a href="${item.url || "#"}" target="_blank" rel="noreferrer">${item.title || "Astronomy Picture of the Day"}</a>
          <p>${item.explanation || ""}</p>
        </div>`;
    }
    if (widget.kind === "spacex") {
      const item = widget.items[0] || {};
      return `
        <div class="intel-card">
          <div class="intel-card-head">${widget.title}<small>${widget.source}</small></div>
          <a href="${item.links || "#"}" target="_blank" rel="noreferrer">${item.name || "Next launch"}</a>
          <p>${item.details || "Launch details pending."}</p>
          <p class="meta">T-${item.date ? formatCountdown(item.date) : "TBA"}</p>
        </div>`;
    }
    return "";
  }).join("");
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
    const span = els.voiceToggle.querySelector("span");
    if (span) span.textContent = on ? "Voice On" : "AI Voice";
    els.voiceToggle.classList.toggle("voice-on", on);
    els.voiceToggle.setAttribute("aria-pressed", String(on));
  }
  if (on) {
    // Browsers require a user gesture before audio plays.
    // Toggling counts, so we can announce a confirmation now (British female).
    speakHeadline("AI voice agent activated. Standing by for breaking headlines.");
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
  if (!response || !response.ok) throw new Error("Live feed request failed");
  const payload = await response.json();
  const satellitePayload = satelliteResponse && satelliteResponse.ok ? await satelliteResponse.json() : { satellites: [], sources: [] };
  const cameraPayload = cameraResponse && cameraResponse.ok ? await cameraResponse.json() : { cameras: [], sources: [] };
  const newsPayload = newsResponse && newsResponse.ok ? await newsResponse.json() : { items: [], sources: [] };
  const intelPayload = intelResponse && intelResponse.ok ? await intelResponse.json() : { widgets: [], sources: [] };
  state.baseEvents = payload.events;
  state.satelliteTles = satellitePayload.satellites ?? [];
  state.cameras = cameraPayload.cameras ?? [];
  const incomingNews = newsPayload.items ?? [];
  detectBreakingNews(incomingNews); // sets state.news + state.rawNews internally
  state.intel = intelPayload.widgets ?? [];
  computeSatelliteEvents();
  state.events = [...state.baseEvents, ...state.satelliteEvents];
  const totalSources = (payload.sources?.length ?? 0)
    + (satellitePayload.sources?.length ?? 0)
    + (cameraPayload.sources?.length ?? 0)
    + (newsPayload.sources?.length ?? 0)
    + (intelPayload.sources?.length ?? 0);
  els.sourceCount.textContent = totalSources;
  els.hudSourceCount.textContent = `${totalSources} sources · ${state.events.length} signals`;
  els.brandSub.textContent = `Fusing ${totalSources} open intelligence sources in real time`;
  els.lastUpdated.textContent = formatTime(payload.updated_at);
  els.feedState.textContent = modeStatusText(state.mode);
  renderCameras();
  renderNews();
  renderIntel();
  renderAll();
  renderTelemetry();
  processNewAlerts(state.events);
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
  if (!els.globeClock) return;
  const now = new Date();
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  els.globeClock.textContent = `${hh}:${mm}:${ss} UTC`;
}

function animate(time) {
  requestAnimationFrame(animate);
  if (state.autoRotate) {
    globeGroup.rotation.y += 0.0009;
  }
  markerGroup.rotation.y = globeGroup.rotation.y;

  for (const marker of state.markers.values()) {
    const isFlashing = marker.userData.flashUntil && marker.userData.flashUntil > time;
    const pulse = 1 + Math.sin(time * 0.008) * (isFlashing ? 0.24 : 0.04);
    marker.scale.setScalar(marker.userData.baseScale * pulse);
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
    state.mode = "live";
    els.commandTabs.forEach((button) => {
      const active = button.dataset.mode === "live";
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    els.modeTelemetry.textContent = "Live Fusion";
    renderAll();
  });

  els.refreshButton.addEventListener("click", () => {
    loadEvents().catch((error) => {
      els.feedState.textContent = error.message;
    });
  });

  els.fullscreenButton.addEventListener("click", async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      els.fullscreenButton.querySelector("span").textContent = "Exit";
    } else {
      await document.exitFullscreen();
      els.fullscreenButton.querySelector("span").textContent = "Full Screen";
    }
    setTimeout(resize, 250);
  });

  els.autoRotateButton.addEventListener("click", () => {
    state.autoRotate = !state.autoRotate;
    els.autoRotateButton.querySelector("span").textContent = state.autoRotate ? "Pause Rotate" : "Rotate";
    els.autoRotateButton.setAttribute("aria-pressed", String(state.autoRotate));
  });

  // Sound is ON by default; reflect that in the button + chrome state
  els.soundToggle.querySelector("span").textContent = "Sound On";
  els.soundToggle.setAttribute("aria-pressed", "true");
  els.soundToggle.classList.add("sound-on");
  els.soundToggle.addEventListener("click", async () => {
    state.audio ??= new (window.AudioContext || window.webkitAudioContext)();
    try { await state.audio.resume(); } catch (_) {}
    state.soundEnabled = !state.soundEnabled;
    els.soundToggle.querySelector("span").textContent = state.soundEnabled ? "Sound On" : "Sound Off";
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
 * Pulls AI clips from the last 60 min and gaming clips from the last 120 min.
 * Flags any never-seen video IDs as "fresh" so they slide in with the
 * is-new flash + JUST IN badge. */
async function pollYouTubeVideos(opts = {}) {
  try {
    const [aiRes, gameRes] = await Promise.all([
      fetch(`/api/videos/ai?ts=${Date.now()}`),
      fetch(`/api/videos/gaming?ts=${Date.now()}`),
    ]);
    let renderedAny = false;
    let firedVideoSound = false;
    if (aiRes.ok) {
      const payload = await aiRes.json();
      const incoming = payload.items ?? [];
      const newIds = opts.bootstrap
        ? new Set()
        : new Set(incoming.filter((v) => !state.seenVideoIds.has(v.id)).map((v) => v.id));
      incoming.forEach((v) => state.seenVideoIds.add(v.id));
      if (newIds.size > 0) {
        state.freshVideoIds = new Set([...state.freshVideoIds, ...newIds]);
        if (!firedVideoSound) { playAlertSound("video"); firedVideoSound = true; }
        setTimeout(() => {
          newIds.forEach((id) => state.freshVideoIds.delete(id));
          renderNews();
        }, 6000);
      }
      state.aiVideos = incoming;
      renderedAny = true;
    }
    if (gameRes.ok) {
      const payload = await gameRes.json();
      const incoming = payload.items ?? [];
      const newIds = opts.bootstrap
        ? new Set()
        : new Set(incoming.filter((v) => !state.seenVideoIds.has(v.id)).map((v) => v.id));
      incoming.forEach((v) => state.seenVideoIds.add(v.id));
      if (newIds.size > 0) {
        state.freshVideoIds = new Set([...state.freshVideoIds, ...newIds]);
        if (!firedVideoSound) { playAlertSound("video"); firedVideoSound = true; }
        setTimeout(() => {
          newIds.forEach((id) => state.freshVideoIds.delete(id));
          renderNews();
        }, 6000);
      }
      state.gamingVideos = incoming;
      renderedAny = true;
    }
    if (renderedAny) renderNews();
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
