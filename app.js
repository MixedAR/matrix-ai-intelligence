const $ = (selector) => document.querySelector(selector);

const els = {
  clock: $("#metricClock"),
  metricStories: $("#metricStories"),
  metricVideos: $("#metricVideos"),
  metricSources: $("#metricSources"),
  metricTsla: $("#metricTsla"),
  metricTslaChange: $("#metricTslaChange"),
  breakingSource: $("#breakingSource"),
  breakingHeadline: $("#breakingHeadline"),
  priorityGrid: $("#priorityGrid"),
  priorityMeta: $("#priorityMeta"),
  videoTheater: $("#videoTheater"),
  videoRail: $("#videoRail"),
  videoMeta: $("#videoMeta"),
  newsGrid: $("#newsGrid"),
  queueMeta: $("#queueMeta"),
  tickerTrack: $("#tickerTrack"),
  socialFeed: $("#socialFeed"),
  socialMeta: $("#socialMeta"),
  pulseStack: $("#pulseStack"),
  pulseMeta: $("#pulseMeta"),
  sourceToggle: $("#sourceToggle"),
  sourceBadge: $("#sourceBadge"),
  sourceDropdown: $("#sourceDropdown"),
  radarBlips: $("#radarBlips"),
  radarMeta: $("#radarMeta"),
  activityLog: $("#activityLog"),
  activityCount: $("#activityCount"),
  refreshNow: $("#refreshNow"),
  refreshRate: $("#refreshRate"),
  refreshRateValue: $("#refreshRateValue"),
  motionLevel: $("#motionLevel"),
  motionLevelValue: $("#motionLevelValue"),
  voiceVolume: $("#voiceVolume"),
  voiceVolumeValue: $("#voiceVolumeValue"),
  voiceToggle: $("#voiceToggle"),
  jarvisBlob: $("#jarvisBlob"),
  jarvisStatus: $("#jarvisStatus"),
  jarvisForm: $("#jarvisForm"),
  jarvisInput: $("#jarvisInput"),
  jarvisLog: $("#jarvisLog"),
  viewer: $("#viewer"),
  viewerSource: $("#viewerSource"),
  viewerTitle: $("#viewerTitle"),
  viewerFrame: $("#viewerFrame"),
  viewerExternal: $("#viewerExternal"),
  viewerClose: $("#viewerClose"),
};

const state = {
  news: [],
  videos: [],
  social: [],
  stock: null,
  pulse: null,
  tts: null,
  selectedVideo: null,
  priorityTimer: null,
  priorityPaused: false,
  queueTimer: null,
  queuePaused: false,
  seenIds: new Set(),
  activity: 0,
  refreshMs: Number(localStorage.getItem("matrix.refreshMs") || 25000),
  voiceOn: localStorage.getItem("matrix.voiceOn") !== "0",
  volume: Number(localStorage.getItem("matrix.voiceVolume") || 0.88),
  timer: null,
  currentAudio: null,
  lastSpokenId: localStorage.getItem("matrix.lastSpokenId") || "",
};

const CACHE_KEY = "matrix.opsDashboard.cache.aiOnly.v2";

const escapeMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => escapeMap[ch]);
}

function safeUrl(value, fallback = "#") {
  try {
    const url = new URL(String(value || ""), location.href);
    if (url.protocol === "http:" || url.protocol === "https:" || url.origin === location.origin) return url.href;
  } catch (_) {}
  return fallback;
}

function timeValue(value) {
  const t = Date.parse(value || "");
  return Number.isFinite(t) ? t : 0;
}

function relativeTime(value) {
  const diff = Date.now() - timeValue(value);
  if (!Number.isFinite(diff) || diff < 0) return "now";
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

function imageFor(item) {
  if (item?.thumbnail) return safeUrl(item.thumbnail, "");
  if (item?.video_id) return `https://i.ytimg.com/vi/${encodeURIComponent(item.video_id)}/hqdefault.jpg`;
  const seed = encodeURIComponent((item?.source || "ai") + "-" + (item?.title || "matrix"));
  return `https://picsum.photos/seed/${seed}/900/560`;
}

function excludedTopic(item) {
  const text = `${item?.title || ""} ${item?.summary || ""} ${item?.text || ""}`.toLowerCase();
  return /\b(crypto|cryptocurrency|bitcoin|btc|ethereum|eth\b|xrp\b|bnb\b|solana|web3|defi|nft)\b/.test(text);
}

function isAIRelevant(item) {
  const text = `${item?.title || ""} ${item?.summary || ""}`.toLowerCase();
  return /\b(ai|a\.i\.|artificial intelligence|machine learning|ml\b|llm|large language model|generative|genai|agentic|agent\b|agents\b|openai|chatgpt|gpt|codex|anthropic|claude|gemini|deepmind|deepseek|mistral|cohere|perplexity|hugging face|nvidia|gpu|neural|transformer|diffusion|robotics?|model|models|inference|training|fine-tuning|fine tuning|dataset|datasets|prompt|prompts)\b/.test(text);
}

function keepAIItem(item) {
  return !excludedTopic(item) && isAIRelevant(item);
}

async function fetchJson(path) {
  const res = await fetch(`${path}${path.includes("?") ? "&" : "?"}ts=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

function tickClock() {
  const now = new Date();
  const value = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}:${String(now.getUTCSeconds()).padStart(2, "0")}`;
  if (els.clock) els.clock.textContent = value;
}

function addActivity(label, text) {
  if (!els.activityLog) return;
  state.activity += 1;
  const now = new Date();
  const li = document.createElement("li");
  li.innerHTML = `<time>${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}:${String(now.getUTCSeconds()).padStart(2, "0")}</time><strong>${escapeHTML(label)} · ${escapeHTML(text)}</strong>`;
  els.activityLog.prepend(li);
  while (els.activityLog.children.length > 24) els.activityLog.lastElementChild.remove();
  if (els.activityCount) els.activityCount.textContent = `${state.activity} events`;
}

function openViewer(item) {
  const url = safeUrl(item.url);
  if (!els.viewer || url === "#") return;
  els.viewerSource.textContent = item.source || "SOURCE";
  els.viewerTitle.textContent = item.title || "Source preview";
  els.viewerExternal.href = url;
  els.viewerFrame.src = url;
  els.viewer.classList.remove("hidden");
}

function closeViewer() {
  els.viewer?.classList.add("hidden");
  if (els.viewerFrame) els.viewerFrame.src = "about:blank";
}

function newsCard(item, primary = false) {
  const img = imageFor(item);
  const titleTag = primary ? "h2" : "h3";
  return `
    <a class="intel-card ${primary ? "primary" : ""}" href="${escapeHTML(safeUrl(item.url))}" data-open="${escapeHTML(item.id)}">
      <div class="card-image" style="background-image:url('${escapeHTML(img)}')"></div>
      <div class="card-shade"></div>
      <div class="card-body">
        <div class="card-meta"><span>${escapeHTML(item.source || "AI SOURCE")}</span><time>${relativeTime(item.time)}</time></div>
        <${titleTag}>${escapeHTML(item.title || "Untitled intelligence")}</${titleTag}>
        <p>${escapeHTML(item.summary || "")}</p>
      </div>
    </a>`;
}

function queueCard(item) {
  return `
    <a class="queue-card" href="${escapeHTML(safeUrl(item.url))}" data-open="${escapeHTML(item.id)}">
      <div class="queue-meta"><span>${escapeHTML(item.source || "AI")}</span><time>${relativeTime(item.time)} ago</time></div>
      <h3>${escapeHTML(item.title || "Untitled")}</h3>
      <p>${escapeHTML(item.summary || "")}</p>
    </a>`;
}

function queueFeatureCard(item) {
  const img = imageFor(item);
  return `
    <a class="queue-feature-card" href="${escapeHTML(safeUrl(item.url))}" data-open="${escapeHTML(item.id)}">
      <div class="queue-feature-image" style="background-image:url('${escapeHTML(img)}')"></div>
      <div class="queue-feature-shade"></div>
      <div class="queue-feature-body">
        <div class="queue-meta"><span>${escapeHTML(item.source || "AI")}</span><time>${relativeTime(item.time)} ago</time></div>
        <h3>${escapeHTML(item.title || "Untitled intelligence")}</h3>
        <p>${escapeHTML(item.summary || "")}</p>
      </div>
    </a>`;
}

function queueMiniCard(item) {
  return `
    <a class="queue-mini-card" href="${escapeHTML(safeUrl(item.url))}" data-open="${escapeHTML(item.id)}">
      <span>
        <div class="queue-meta"><b>${escapeHTML(item.source || "AI")}</b><time>${relativeTime(item.time)}</time></div>
        <h3>${escapeHTML(item.title || "Untitled")}</h3>
        <p>${escapeHTML(item.summary || "")}</p>
      </span>
      <img src="${escapeHTML(imageFor(item))}" alt="">
    </a>`;
}

function priorityPages(items) {
  const pages = [];
  for (let i = 0; i < items.length; i += 2) {
    pages.push(`<div class="priority-page">${items.slice(i, i + 2).map((item, index) => newsCard(item, i === 0 && index === 0)).join("")}</div>`);
  }
  return pages.join("");
}

function renderNews() {
  const fresh = state.news
    .filter((item) => item?.title)
    .sort((a, b) => timeValue(b.time) - timeValue(a.time));
  const priority = fresh.slice(0, 8);
  const queue = fresh.slice(8, 22);

  els.metricStories.textContent = String(fresh.length);
  if (els.priorityMeta) els.priorityMeta.textContent = `${priority.length} priority`;
  if (els.queueMeta) els.queueMeta.textContent = `${queue.length} queued`;

  if (priority[0]) {
    els.breakingSource.textContent = (priority[0].source || "AI WIRE").toUpperCase();
    els.breakingHeadline.textContent = priority[0].title || "";
  }

  els.priorityGrid.innerHTML = priority.length
    ? priorityPages(priority)
    : `<div class="queue-card"><h3>Synchronizing priority intelligence...</h3><p>Live sources are connecting.</p></div>`;
  armPriorityCarousel();
  renderQueue(queue);

  const ticker = fresh.slice(0, 22).map((item) => `<span><b>${escapeHTML((item.source || "AI").toUpperCase())}</b>${escapeHTML(item.title || "")}</span>`).join("");
  els.tickerTrack.innerHTML = ticker + ticker;
  bindOpenCards();
}

function renderQueue(items) {
  if (!els.newsGrid) return;
  if (!items.length) {
    els.newsGrid.innerHTML = `<div class="queue-card"><h3>Synchronizing intelligence queue...</h3><p>Live sources are connecting.</p></div>`;
    return;
  }
  const featured = items[0];
  const rail = items.slice(1);
  els.newsGrid.innerHTML = `
    <div class="queue-layout">
      ${queueFeatureCard(featured)}
      <div id="queueRail" class="queue-rail" aria-label="Scrolling intelligence queue">
        ${rail.map(queueMiniCard).join("")}
      </div>
    </div>`;
  armQueueScroll();
}

function stepQueueRail() {
  const rail = document.querySelector("#queueRail");
  if (!rail || state.queuePaused || document.hidden) return;
  const first = rail.querySelector(".queue-mini-card");
  if (!first || rail.scrollHeight <= rail.clientHeight + 8) return;
  const gap = parseFloat(getComputedStyle(rail).gap || "10") || 10;
  const step = first.getBoundingClientRect().height + gap;
  const atEnd = rail.scrollTop + rail.clientHeight + step >= rail.scrollHeight - 6;
  rail.scrollTo({ top: atEnd ? 0 : rail.scrollTop + step, behavior: "smooth" });
}

function armQueueScroll() {
  const rail = document.querySelector("#queueRail");
  if (!rail) return;
  if (!state.queueTimer) state.queueTimer = setInterval(stepQueueRail, 8000);
  rail.addEventListener("mouseenter", () => { state.queuePaused = true; });
  rail.addEventListener("mouseleave", () => { state.queuePaused = false; });
  rail.addEventListener("focusin", () => { state.queuePaused = true; });
  rail.addEventListener("focusout", () => { state.queuePaused = false; });
}

function stepPriorityCarousel() {
  const track = els.priorityGrid;
  if (!track || state.priorityPaused || document.hidden) return;
  const first = track.querySelector(".intel-card");
  if (!first || track.scrollWidth <= track.clientWidth + 8) return;
  const page = track.querySelector(".priority-page");
  const step = page ? page.getBoundingClientRect().width + (parseFloat(getComputedStyle(track).gap || "12") || 12) : first.getBoundingClientRect().width;
  const atEnd = track.scrollLeft + track.clientWidth + step >= track.scrollWidth - 6;
  track.scrollTo({ left: atEnd ? 0 : track.scrollLeft + step, behavior: "smooth" });
}

function armPriorityCarousel() {
  const track = els.priorityGrid;
  if (!track || state.priorityTimer) return;
  track.addEventListener("mouseenter", () => { state.priorityPaused = true; });
  track.addEventListener("mouseleave", () => { state.priorityPaused = false; });
  track.addEventListener("focusin", () => { state.priorityPaused = true; });
  track.addEventListener("focusout", () => { state.priorityPaused = false; });
  state.priorityTimer = setInterval(stepPriorityCarousel, 10000);
}

function setVideo(item, autoplay = false) {
  if (!item) {
    els.videoTheater.innerHTML = `<div class="video-preview"><div class="video-copy"><h2>AI Video Watch</h2><p>Waiting for YouTube intelligence clips.</p></div></div>`;
    return;
  }
  state.selectedVideo = item;
  const thumb = imageFor(item);
  if (autoplay && item.video_id) {
    els.videoTheater.innerHTML = `<iframe src="https://www.youtube.com/embed/${encodeURIComponent(item.video_id)}?autoplay=1&rel=0" title="${escapeHTML(item.title)}"></iframe>`;
  } else {
    els.videoTheater.innerHTML = `
      <button class="video-preview" style="background-image:url('${escapeHTML(thumb)}')" type="button">
        <span class="play-badge">Play in Desk</span>
        <div class="video-copy">
          <p class="eyebrow">${escapeHTML(item.source || "AI VIDEO")} · ${relativeTime(item.time)} ago</p>
          <h2>${escapeHTML(item.title || "AI video")}</h2>
          <p>${escapeHTML(item.summary || "Click to play this YouTube video inside the dashboard.")}</p>
        </div>
      </button>`;
    $(".video-preview")?.addEventListener("click", () => setVideo(item, true));
  }
  document.querySelectorAll(".video-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.videoId === item.id);
  });
}

function renderVideos() {
  const videos = state.videos
    .filter((item) => item?.title && item?.video_id)
    .sort((a, b) => timeValue(b.time) - timeValue(a.time));
  els.metricVideos.textContent = String(videos.length);
  const newest = videos[0] ? `${relativeTime(videos[0].time)} ago` : "scanning";
  els.videoMeta.textContent = `${videos.length} videos · newest ${newest}`;
  if (!state.selectedVideo || !videos.some((v) => v.id === state.selectedVideo.id)) setVideo(videos[0] || null);
  els.videoRail.innerHTML = videos.map((item) => `
    <button class="video-card ${state.selectedVideo?.id === item.id ? "active" : ""}" type="button" data-video-id="${escapeHTML(item.id)}">
      <img src="${escapeHTML(imageFor(item))}" alt="">
      <span>
        <div class="queue-meta"><b>${escapeHTML(item.source || "AI")}</b><time>${relativeTime(item.time)}</time></div>
        <h3>${escapeHTML(item.title || "")}</h3>
        <p>${escapeHTML(item.summary || "")}</p>
      </span>
    </button>`).join("");
  els.videoRail.querySelectorAll(".video-card").forEach((button) => {
    button.addEventListener("click", () => {
      const video = videos.find((item) => item.id === button.dataset.videoId);
      if (video) setVideo(video, true);
    });
  });
}

function looksEnglish(text) {
  return !/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0400-\u04ff]/.test(String(text || ""));
}

function renderSocial() {
  const items = state.social.filter((item) => item?.text && looksEnglish(item.text)).slice(0, 16);
  els.socialMeta.textContent = `${items.length} intercepted`;
  els.socialFeed.innerHTML = items.map((item) => `
    <a class="social-card" href="${escapeHTML(safeUrl(item.url))}" target="_blank" rel="noreferrer">
      <div class="social-top"><span>${escapeHTML((item.network || "social").toUpperCase())}</span><time>${relativeTime(item.time)} ago</time></div>
      <p>${escapeHTML(item.text || "")}</p>
    </a>`).join("");
}

function renderPulse() {
  const p = state.pulse || {};
  const cards = [];
  (p.papers || []).slice(0, 3).forEach((item) => cards.push({ tag: "ARXIV", title: item.title, body: item.summary, url: item.url }));
  (p.models || []).slice(0, 3).forEach((item) => cards.push({ tag: "MODEL", title: item.id || item.name, body: `${item.downloads || 0} downloads · ${item.pipeline_tag || "model"}`, url: item.url }));
  (p.repos || []).slice(0, 3).forEach((item) => cards.push({ tag: "GITHUB", title: item.full_name || item.name, body: item.description, url: item.html_url || item.url }));
  els.pulseMeta.textContent = `${cards.length} signals`;
  els.pulseStack.innerHTML = cards.map((item) => `
    <a class="pulse-card" href="${escapeHTML(safeUrl(item.url))}" target="_blank" rel="noreferrer">
      <div class="pulse-top"><span>${escapeHTML(item.tag)}</span><time>live</time></div>
      <h3>${escapeHTML(item.title || "Untitled")}</h3>
      <p>${escapeHTML(item.body || "")}</p>
    </a>`).join("");
}

function renderSources(payloads) {
  const sources = [...new Set([
    ...(payloads.news?.sources || []),
    ...(payloads.videos?.sources || []),
    "Mastodon", "Hacker News", "arXiv", "Hugging Face", "GitHub",
  ])].slice(0, 18);
  if (els.metricSources) els.metricSources.textContent = String(sources.length);
  if (els.sourceBadge) els.sourceBadge.textContent = String(sources.length);
  if (els.sourceDropdown) {
    els.sourceDropdown.innerHTML = sources.map((source) => `<div class="source-row" role="menuitem"><span>${escapeHTML(source)}</span><b>LIVE</b></div>`).join("");
  }
}

function renderStock() {
  const stock = state.stock || {};
  if (!els.metricTsla || !els.metricTslaChange) return;
  if (typeof stock.price !== "number") {
    els.metricTsla.textContent = "--";
    els.metricTslaChange.textContent = "TSLA";
    return;
  }
  els.metricTsla.textContent = `$${stock.price.toFixed(2)}`;
  const change = typeof stock.change === "number" ? stock.change : null;
  const pct = typeof stock.changePct === "number" ? stock.changePct : null;
  const sign = change && change > 0 ? "+" : "";
  els.metricTslaChange.textContent = change === null || pct === null ? "TSLA" : `${sign}${change.toFixed(2)} · ${sign}${pct.toFixed(2)}%`;
  els.metricTslaChange.classList.toggle("up", Boolean(change && change > 0));
  els.metricTslaChange.classList.toggle("down", Boolean(change && change < 0));
}

function renderRadar() {
  const items = state.news.slice(0, 24);
  els.radarMeta.textContent = `${items.length} tracks`;
  els.radarBlips.innerHTML = items.map((item) => {
    let hash = 0;
    for (const ch of item.id || item.title || "") hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const radius = 22 + (hash % 53);
    const angle = ((hash / 97) % 360) * Math.PI / 180;
    const x = 50 + Math.cos(angle) * radius;
    const y = 50 + Math.sin(angle) * radius;
    return `<span class="blip" title="${escapeHTML(item.title || "")}" style="left:${x}%;top:${y}%;animation-delay:-${hash % 1700}ms"></span>`;
  }).join("");
}

function bindOpenCards() {
  document.querySelectorAll("[data-open]").forEach((el) => {
    el.addEventListener("click", (event) => {
      event.preventDefault();
      const id = el.dataset.open;
      const item = state.news.find((n) => n.id === id);
      if (item) openViewer(item);
    });
  });
}

function renderAll(payloads = {}) {
  renderNews();
  renderVideos();
  renderSocial();
  renderPulse();
  renderStock();
  renderRadar();
  if (payloads.news || payloads.videos) renderSources(payloads);
}

function saveCache(payload = {}) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      at: Date.now(),
      news: state.news,
      videos: state.videos,
      social: state.social,
      stock: state.stock,
      pulse: state.pulse,
      sources: payload.news?.sources || [],
      videoSources: payload.videos?.sources || [],
    }));
  } catch (_) {}
}

function hydrateFromCache() {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (!cache || Date.now() - cache.at > 30 * 60 * 1000) return;
    state.news = Array.isArray(cache.news) ? cache.news.filter(keepAIItem) : [];
    state.videos = Array.isArray(cache.videos) ? cache.videos : [];
    state.social = Array.isArray(cache.social) ? cache.social : [];
    state.stock = cache.stock || null;
    state.pulse = cache.pulse || null;
    renderAll({
      news: { sources: cache.sources || [] },
      videos: { sources: cache.videoSources || [] },
    });
    addActivity("CACHE", "Rendered last live snapshot while sources refresh");
  } catch (_) {}
}

async function loadAll({ silent = false } = {}) {
  try {
    const [news, videos, social, stock] = await Promise.all([
      fetchJson("/api/news"),
      fetchJson("/api/videos/ai"),
      fetchJson("/api/social"),
      fetchJson("/api/stock"),
    ]);
    const newsItems = (news.items || []).filter(keepAIItem);
    const incoming = [...newsItems, ...(videos.items || [])].filter((item) => item.id && !state.seenIds.has(item.id));
    state.news = newsItems;
    state.videos = videos.items || [];
    state.social = (social.items || []).filter((item) => !excludedTopic(item));
    state.stock = stock;
    [...state.news, ...state.videos].forEach((item) => item.id && state.seenIds.add(item.id));
    renderAll({ news, videos });
    saveCache({ news, videos });
    if (!silent) addActivity("SYNC", `Updated ${state.news.length} reports and ${state.videos.length} videos`);
    const newest = incoming.sort((a, b) => timeValue(b.time) - timeValue(a.time))[0];
    if (newest) {
      addActivity("NEW", newest.title || "New intelligence item");
      maybeSpeakBreaking(newest);
    }
    fetchJson("/api/tts/status").then((tts) => { state.tts = tts; }).catch(() => {});
    fetchJson("/api/aipulse").then((pulse) => {
      state.pulse = pulse;
      renderPulse();
      saveCache({ news, videos });
    }).catch(() => {});
  } catch (error) {
    addActivity("ERROR", error.message || "Feed refresh failed");
  }
}

function restartTimer() {
  clearInterval(state.timer);
  state.timer = setInterval(() => loadAll(), state.refreshMs);
}

function stopAudio() {
  if (state.currentAudio) {
    try { state.currentAudio.pause(); state.currentAudio.src = ""; } catch (_) {}
  }
  state.currentAudio = null;
  els.jarvisBlob?.classList.remove("speaking");
}

async function speak(text, forced = false) {
  if (!text || (!state.voiceOn && !forced)) return;
  stopAudio();
  try {
    els.jarvisBlob?.classList.add("speaking");
    const audio = new Audio(`/api/tts?provider=jarvis&voice=jarvis&text=${encodeURIComponent(text.slice(0, 750))}`);
    audio.volume = state.volume;
    state.currentAudio = audio;
    audio.addEventListener("ended", () => els.jarvisBlob?.classList.remove("speaking"), { once: true });
    audio.addEventListener("error", () => els.jarvisBlob?.classList.remove("speaking"), { once: true });
    await audio.play();
  } catch (_) {
    els.jarvisBlob?.classList.remove("speaking");
  }
}

function maybeSpeakBreaking(item) {
  if (!item?.id || item.id === state.lastSpokenId) return;
  state.lastSpokenId = item.id;
  localStorage.setItem("matrix.lastSpokenId", item.id);
  speak(`Incoming AI intelligence. ${item.source || "The wire"} reports: ${item.title}`);
}

function addJarvisMessage(text, from = "agent") {
  const div = document.createElement("div");
  div.className = `jarvis-msg ${from}`;
  div.textContent = text;
  els.jarvisLog.prepend(div);
  while (els.jarvisLog.children.length > 14) els.jarvisLog.lastElementChild.remove();
}

function jarvisProviderLabel(provider, fallback = false) {
  if (provider === "deepseek" && !fallback) return "DeepSeek online";
  if (provider === "open-meteo") return "Weather live";
  if (provider === "local-fallback" || fallback) return "Local fallback";
  return provider || "Agent online";
}

async function askJarvis(query) {
  const text = query.trim();
  if (!text) return;
  addJarvisMessage(text, "user");
  els.jarvisStatus.textContent = "thinking";
  els.jarvisBlob?.classList.add("listening");
  try {
    const res = await fetch("/api/jarvis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: text,
        context: {
          news: state.news.slice(0, 8),
          videos: state.videos.slice(0, 6),
          social: state.social.slice(0, 6),
          research: [
            ...((state.pulse?.papers || []).slice(0, 3)),
            ...((state.pulse?.models || []).slice(0, 3)),
            ...((state.pulse?.repos || []).slice(0, 2)),
          ],
          metrics: {
            stories: state.news.length,
            videos: state.videos.length,
            sources: els.sourceBadge?.textContent || "",
          },
          stock: state.stock,
        },
      }),
    });
    const payload = await res.json();
    const answer = payload.answer || "I am online, sir, but the agent core returned no briefing.";
    addJarvisMessage(answer, "agent");
    els.jarvisStatus.textContent = jarvisProviderLabel(payload.provider, payload.fallback);
    speak(answer, true);
  } catch (_) {
    const answer = "I am having trouble reaching the agent core. The dashboard feeds remain online.";
    addJarvisMessage(answer, "agent");
    els.jarvisStatus.textContent = "agent degraded";
    speak(answer, true);
  } finally {
    els.jarvisBlob?.classList.remove("listening");
  }
}

function initControls() {
  els.refreshRate.value = String(Math.round(state.refreshMs / 1000));
  els.refreshRateValue.textContent = `${Math.round(state.refreshMs / 1000)}s`;
  els.voiceVolume.value = String(Math.round(state.volume * 100));
  els.voiceVolumeValue.textContent = String(Math.round(state.volume * 100));
  els.voiceToggle.setAttribute("aria-pressed", String(state.voiceOn));

  els.refreshNow.addEventListener("click", () => loadAll());
  els.refreshRate.addEventListener("input", () => {
    state.refreshMs = Number(els.refreshRate.value) * 1000;
    localStorage.setItem("matrix.refreshMs", String(state.refreshMs));
    els.refreshRateValue.textContent = `${els.refreshRate.value}s`;
    restartTimer();
  });
  els.motionLevel.addEventListener("input", () => {
    const value = Number(els.motionLevel.value);
    els.motionLevelValue.textContent = String(value);
    document.documentElement.style.setProperty("--motion", String(Math.max(0.15, value / 78)));
  });
  els.voiceVolume.addEventListener("input", () => {
    state.volume = Number(els.voiceVolume.value) / 100;
    localStorage.setItem("matrix.voiceVolume", String(state.volume));
    els.voiceVolumeValue.textContent = els.voiceVolume.value;
    if (state.currentAudio) state.currentAudio.volume = state.volume;
  });
  els.voiceToggle.addEventListener("click", () => {
    state.voiceOn = !state.voiceOn;
    localStorage.setItem("matrix.voiceOn", state.voiceOn ? "1" : "0");
    els.voiceToggle.setAttribute("aria-pressed", String(state.voiceOn));
    if (!state.voiceOn) stopAudio();
  });
  els.sourceToggle?.addEventListener("click", () => {
    const willOpen = els.sourceDropdown?.classList.contains("hidden");
    els.sourceDropdown?.classList.toggle("hidden", !willOpen);
    els.sourceToggle.setAttribute("aria-expanded", String(Boolean(willOpen)));
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".source-menu")) {
      els.sourceDropdown?.classList.add("hidden");
      els.sourceToggle?.setAttribute("aria-expanded", "false");
    }
  });
  els.jarvisForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = els.jarvisInput.value;
    els.jarvisInput.value = "";
    askJarvis(value);
  });
  els.jarvisBlob.addEventListener("click", () => {
    askJarvis("Give me a concise live AI intelligence briefing.");
  });
  els.viewerClose.addEventListener("click", closeViewer);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeViewer();
  });
}

initControls();
tickClock();
setInterval(tickClock, 1000);
hydrateFromCache();
loadAll({ silent: true }).then(() => addActivity("SYSTEM", "AI operations desk online"));
restartTimer();
