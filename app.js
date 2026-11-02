// =============================================================================
// A LITTLE MUSIC — app logic
// Plain JavaScript, no build step, no accounts, no tracking.
// Daily picks come from a deterministic schedule over the catalogue, so the
// piece stays stable all day, repeats are avoided until the catalogue cycles,
// and past/future days can be computed cheaply.
// =============================================================================

const CATEGORIES = [
  { key: "classical", name: "Classical", desc: "From Baroque to the present day — orchestral, chamber, solo piano." },
  { key: "jazz", name: "Jazz", desc: "Standards, small groups, and voices across a century of jazz." },
  { key: "folk", name: "Folk & Traditional", desc: "Ballads, work songs, and traditions carried by singers and players." },
  { key: "rock", name: "Rock", desc: "Guitars, from the foundations of rock ’n’ roll to punk, indie, and beyond." },
  { key: "hiphop", name: "Hip Hop", desc: "From the early block-party foundations to today’s voices on the mic." },
];

// Subtle accent tones per category (soft tint + strong tone), light then dark.
const CAT_COLORS = {
  classical: { soft: "#e9ddc8", strong: "#7a5a2e", softD: "#3a3222", strongD: "#d4b478" },
  jazz:      { soft: "#ead9c9", strong: "#a4502e", softD: "#3d2a1e", strongD: "#e08b5f" },
  folk:      { soft: "#dde5d2", strong: "#5c6b46", softD: "#2c3324", strongD: "#a8b98a" },
  rock:      { soft: "#dbe0e8", strong: "#46617a", softD: "#232c36", strongD: "#93b3cc" },
  hiphop:    { soft: "#e3d5df", strong: "#7a4a6b", softD: "#332430", strongD: "#c795b3" },
};

const STORE = { prefs: "alm.prefs", favs: "alm.favs" };

let catalogue = [];      // all entries
let byId = new Map();
let ytPlayer = null;
let ytReady = false;
let ytPending = null;

// ---------- small helpers ----------------------------------------------------
const $app = () => document.getElementById("app");

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Whole days elapsed since a fixed epoch, based on the LOCAL calendar day.
function dayNumber(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((d.getTime() - new Date(2024, 0, 1).getTime()) / 86400000);
}

function dateForDay(n) {
  const d = new Date(2024, 0, 1);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtDay(n) {
  return dateForDay(n).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// ---------- persistent state --------------------------------------------------
function getJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function setJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

function getPrefs() { return getJSON(STORE.prefs, CATEGORIES.map((c) => c.key)); }
function setPrefs(p) { setJSON(STORE.prefs, p); }
function getFavs() { return getJSON(STORE.favs, []); }
function isFav(id) { return getFavs().includes(id); }
function toggleFav(id) {
  const f = getFavs();
  const i = f.indexOf(id);
  if (i >= 0) f.splice(i, 1); else f.unshift(id);
  setJSON(STORE.favs, f);
  return i < 0;
}

// ---------- the schedule ------------------------------------------------------
// The chosen categories rotate day by day; within a category, a fixed
// deterministic shuffle decides which piece plays at each turn of the cycle.
// Result: stable during the day, no repeats until every piece in the pool
// has appeared once.
function chosenCategories() {
  const prefs = getPrefs().filter((k) => CATEGORIES.some((c) => c.key === k));
  return prefs.length ? prefs : CATEGORIES.map((c) => c.key); // "Across categories" = all
}

function entriesForCategory(cat) {
  return catalogue.filter((e) => e.category === cat);
}

function pieceForDay(n, cats = chosenCategories()) {
  if (!catalogue.length || !cats.length) return null;
  const cat = cats[((n % cats.length) + cats.length) % cats.length];
  const entries = entriesForCategory(cat);
  if (!entries.length) {
    // Category empty (shouldn't happen with a stocked catalogue): fall back to all.
    return pieceForDay(n, CATEGORIES.map((c) => c.key));
  }
  const rand = mulberry32(hashStr("alm-" + cat));
  const order = entries.map((e, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const slot = Math.floor(n / cats.length);
  return entries[order[((slot % order.length) + order.length) % order.length]];
}

function isFreeDay(n) {
  return ALM_CONFIG.betaUnlocked || n > dayNumber() - ALM_CONFIG.freeWindowDays;
}

// ---------- rendering ---------------------------------------------------------
function catColor(cat) {
  const dark = document.documentElement.classList.contains("dark");
  const c = CAT_COLORS[cat] || CAT_COLORS.classical;
  return dark ? { soft: c.softD, strong: c.strongD } : { soft: c.soft, strong: c.strong };
}

function setCatVars(cat) {
  const c = catColor(cat);
  const root = document.documentElement.style;
  root.setProperty("--cat-accent", c.strong);
  root.setProperty("--cat-accent-soft", c.soft);
}

function catName(key) {
  return (CATEGORIES.find((c) => c.key === key) || {}).name || key;
}

function catGlyph(e) {
  return (e.title || "?").replace(/^The\s+/i, "").charAt(0).toUpperCase();
}

function datesLine(e) {
  const parts = [];
  if (e.composer && e.compositionYear) parts.push(`Composed ${e.compositionYear}`);
  else if (!e.composer && e.compositionYear) parts.push(`Dates to about ${e.compositionYear}`);
  if (e.recordingYear) parts.push(`Recorded ${e.recordingYear}`);
  return parts.join(" · ");
}

function heroArtHTML(e, { showDate = true, dayN = null } = {}) {
  return `
    <div class="alm-art">
      <div class="alm-art-meta">
        <span>${esc(catName(e.category))}</span>
        ${showDate && dayN !== null ? `<span>${esc(fmtDay(dayN))}</span>` : ""}
      </div>
      <span class="alm-art-glyph" aria-hidden="true">${esc(catGlyph(e))}</span>
    </div>`;
}

// ---- listening links ---------------------------------------------------------
// Every entry can carry listenLinks: [{ provider, label, url }] — other places
// to hear the recording (Spotify, Apple Music, Bandcamp…). The primary embed
// stays piece.playback; these links are shown alongside it and used when the
// primary player cannot play.
function listenLinks(piece) {
  const links = [];
  const seen = new Set([piece?.playback?.watchUrl]);
  for (const l of piece?.listenLinks || []) {
    if (l && l.url && !seen.has(l.url)) { seen.add(l.url); links.push(l); }
  }
  if (piece?.fallbackUrl && !seen.has(piece.fallbackUrl)) {
    seen.add(piece.fallbackUrl);
    links.push({ provider: "link", label: "another service", url: piece.fallbackUrl });
  }
  return links;
}

const PROVIDER_LABELS = {
  youtube: "YouTube",
  spotify: "Spotify",
  apple: "Apple Music",
  bandcamp: "Bandcamp",
  soundcloud: "SoundCloud",
  tidal: "TIDAL",
};

function linkLabel(l) {
  return l.label || PROVIDER_LABELS[l.provider] || l.provider || "another service";
}

function listenLinksHTML(piece) {
  const links = listenLinks(piece);
  if (!links.length) return "";
  return `<p class="alm-alsolisten">Also listen on ${links
    .map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(linkLabel(l))}</a>`)
    .join(", ")}.</p>`;
}

// ---- Today view ----
function renderToday() {
  const n = dayNumber();
  const piece = pieceForDay(n);
  if (!piece) {
    $app().innerHTML = emptyState("The catalogue is empty.", "Add selections to data/catalogue.json.");
    return;
  }
  setCatVars(piece.category);
  const composerLine = piece.composer ? esc(piece.composer) : "";
  $app().innerHTML = `
    <header class="alm-topbar">
      <a class="alm-wordmark" href="#/today">${esc(ALM_CONFIG.appName)}</a>
      <span class="text-sm text-muted">${esc(fmtDay(n))}</span>
    </header>
    <main class="alm-hero" aria-label="Today's piece">
      ${heroArtHTML(piece, { dayN: n })}
      <div class="alm-hero-body">
        ${composerLine ? `<div class="text-sm text-muted">${composerLine}</div>` : ""}
        <h1 class="alm-title">${esc(piece.title)}</h1>
        <p class="alm-performer">${esc(piece.performer)}</p>
        ${datesLine(piece) ? `<p class="alm-dates">${esc(datesLine(piece))}</p>` : ""}
        <div class="flex items-center gap-3">
          <button class="alm-play" id="btn-play" aria-haspopup="dialog">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>
            Listen
          </button>
          <button class="alm-iconbtn" id="btn-fav" aria-pressed="${isFav(piece.id)}" aria-label="Save to favourites" title="Save">
            <svg viewBox="0 0 24 24" fill="${isFav(piece.id) ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 21s-7.5-4.7-9.5-9A5.4 5.4 0 0 1 12 6.6 5.4 5.4 0 0 1 21.5 12c-2 4.3-9.5 9-9.5 9z"/></svg>
          </button>
          <button class="alm-iconbtn" id="btn-share" aria-label="Share this piece" title="Share">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>
          </button>
        </div>
        <div id="player-slot"></div>
        ${listenLinksHTML(piece)}
        <p class="alm-ctx">${esc(piece.context)}</p>
        ${piece.listenFor ? `<div class="alm-listenfor"><strong>Listen for</strong> — ${esc(piece.listenFor)}</div>` : ""}
        ${piece.recordingNote ? `<p class="alm-recnote">${esc(piece.recordingNote)}</p>` : ""}
        <p class="alm-note">Plays via the provider’s official player; nothing is stored or rehosted here. If it can’t play in your region, use the links above.</p>
        <p class="alm-position">One shared pick a day — the same for every listener. No feed, no tracking: you’ll hear things an algorithm would never send.</p>
      </div>
    </main>
    ${recentStrip(n)}`;

  document.getElementById("btn-play").addEventListener("click", () => loadPlayer(piece));
  document.getElementById("btn-fav").addEventListener("click", (ev) => {
    const saved = toggleFav(piece.id);
    ev.currentTarget.setAttribute("aria-pressed", String(saved));
    ev.currentTarget.querySelector("svg").setAttribute("fill", saved ? "currentColor" : "none");
    toast(saved ? "Saved to your favourites" : "Removed from favourites");
  });
  document.getElementById("btn-share").addEventListener("click", () => sharePiece(piece));
}

function recentStrip(n) {
  const cats = chosenCategories();
  const rows = [];
  for (let i = 1; i <= 3; i++) {
    const p = pieceForDay(n - i, cats);
    if (p) rows.push({ p, n: n - i });
  }
  if (!rows.length) return "";
  return `
    <h2 class="alm-section-title">Recently featured</h2>
    <div class="alm-list">
      ${rows.map(({ p, n: dn }) => itemHTML(p, { dayN: dn })).join("")}
    </div>`;
}

// ---- shared list-item ----
function itemHTML(p, { dayN = null, favBtn = false } = {}) {
  const c = catColor(p.category);
  return `
    <a class="alm-item" href="#/piece/${esc(p.id)}" style="--cat-accent:${c.strong};--cat-accent-soft:${c.soft}">
      <span class="alm-item-art" aria-hidden="true">${esc(catGlyph(p))}</span>
      <span class="alm-item-body">
        <span class="alm-item-title">${esc(p.title)}</span>
        <span class="alm-item-sub">${esc(p.performer)} · ${esc(catName(p.category))}</span>
      </span>
      ${dayN !== null ? `<span class="alm-item-date">${esc(fmtDay(dayN))}</span>` : ""}
      ${favBtn ? `<button class="alm-iconbtn alm-item-fav" data-fav="${esc(p.id)}" aria-pressed="${isFav(p.id)}" aria-label="Remove from favourites">
        <svg viewBox="0 0 24 24" fill="${isFav(p.id) ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 21s-7.5-4.7-9.5-9A5.4 5.4 0 0 1 12 6.6 5.4 5.4 0 0 1 21.5 12c-2 4.3-9.5 9-9.5 9z"/></svg>
      </button>` : ""}
    </a>`;
}

// ---- Archive view ----
function renderArchive() {
  const n = dayNumber();
  const cats = chosenCategories();
  const maxLookBack = 60;
  const rows = [];
  for (let i = 0; i <= maxLookBack; i++) {
    const p = pieceForDay(n - i, cats);
    if (p) rows.push({ p, n: n - i });
  }
  setCatVars(cats.length === 1 ? cats[0] : "classical");
  $app().innerHTML = `
    <header class="alm-topbar">
      <a class="alm-wordmark" href="#/today">${esc(ALM_CONFIG.appName)}</a>
    </header>
    <h1 class="alm-section-title">Archive</h1>
    <p class="text-sm text-muted" style="margin-bottom:16px">Free includes today and the previous ${ALM_CONFIG.freeWindowDays} days.${ALM_CONFIG.betaUnlocked ? " The full archive is unlocked for the beta." : ""}</p>
    <div class="alm-list">
      ${rows.map(({ p, n: dn }, i) => {
        if (isFreeDay(dn)) return itemHTML(p, { dayN: dn });
        return `
          <div class="alm-locked" role="note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
            <span><strong style="color:var(--text-secondary)">${esc(fmtDay(dn))}</strong> — part of the full archive, included with a subscription.</span>
          </div>`;
      }).join("")}
    </div>
    ${ALM_CONFIG.betaUnlocked ? `
      <h2 class="alm-section-title">Supporting the app</h2>
      <p class="alm-note">Planned, not yet switched on: free access covers today plus the last ${ALM_CONFIG.freeWindowDays} days; a subscription unlocks the full archive and curated listening journeys. Beta access is currently fully unlocked (config.js → betaUnlocked).</p>` : ""}`;
}

// ---- Favourites view ----
function renderFavourites() {
  const favs = getFavs().map((id) => byId.get(id)).filter(Boolean);
  setCatVars("jazz");
  $app().innerHTML = `
    <header class="alm-topbar">
      <a class="alm-wordmark" href="#/today">${esc(ALM_CONFIG.appName)}</a>
    </header>
    <h1 class="alm-section-title">Saved</h1>
    ${favs.length ? `<div class="alm-list" id="fav-list">
      ${favs.map((p) => itemHTML(p, { favBtn: true })).join("")}
    </div>` : emptyState("Nothing saved yet", "Tap the heart on a piece you enjoyed and it will be kept here — on this device only, no account needed.")}`;
  $app().querySelectorAll("[data-fav]").forEach((btn) => {
    btn.addEventListener("click", () => {
      toggleFav(btn.dataset.fav);
      renderFavourites();
    });
  });
}

// ---- Settings / preferences ----
function renderSettings() {
  const prefs = getPrefs();
  $app().innerHTML = `
    <header class="alm-topbar">
      <a class="alm-wordmark" href="#/today">${esc(ALM_CONFIG.appName)}</a>
    </header>
    <h1 class="alm-section-title">Your categories</h1>
    <p class="text-sm text-muted" style="margin-bottom:16px">Choose what you’re curious about. Pieces rotate through your categories day by day. Change it whenever you like — nothing is tracked.</p>
    ${CATEGORIES.map((c) => `
      <label class="alm-pref">
        <input type="checkbox" value="${c.key}" ${prefs.includes(c.key) ? "checked" : ""} data-cat="${c.key}">
        <span>
          <span class="alm-pref-name">${c.name}</span>
          <span class="alm-pref-desc" style="display:block">${c.desc}</span>
        </span>
      </label>`).join("")}
    <p class="alm-note">Picking everything is the “Across categories” option — the daily piece roams the whole catalogue. Either way the pick of the day is the same for everyone: no profile, no algorithm, and your preferences and favourites never leave this device.</p>`;

  $app().querySelectorAll("input[data-cat]").forEach((box) => {
    box.addEventListener("change", () => {
      const active = Array.from($app().querySelectorAll("input[data-cat]"))
        .filter((b) => b.checked).map((b) => b.dataset.cat);
      setPrefs(active);
      toast("Preferences updated");
    });
  });
}

// ---- Piece detail (share target) ----
function renderPiece(id) {
  const p = byId.get(id);
  if (!p) {
    $app().innerHTML = emptyState("That piece isn’t in the catalogue.", "It may have been removed. <a href='#/today' style='color:var(--alm-accent)'>Go to today’s piece</a>.");
    return;
  }
  setCatVars(p.category);
  const intro = `Shared from ${ALM_CONFIG.appName} — a piece worth hearing.`;
  $app().innerHTML = `
    <header class="alm-topbar">
      <a class="alm-wordmark" href="#/today">${esc(ALM_CONFIG.appName)}</a>
      <span class="text-sm text-muted">${esc(catName(p.category))}</span>
    </header>
    <p class="alm-share-intro">${esc(intro)}</p>
    <main class="alm-hero">
      ${heroArtHTML(p)}
      <div class="alm-hero-body">
        ${p.composer ? `<div class="text-sm text-muted">${esc(p.composer)}</div>` : ""}
        <h1 class="alm-title">${esc(p.title)}</h1>
        <p class="alm-performer">${esc(p.performer)}</p>
        ${datesLine(p) ? `<p class="alm-dates">${esc(datesLine(p))}</p>` : ""}
        <div class="flex items-center gap-3">
          <button class="alm-play" id="btn-play">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>
            Listen
          </button>
          <button class="alm-iconbtn" id="btn-fav" aria-pressed="${isFav(p.id)}" aria-label="Save to favourites">
            <svg viewBox="0 0 24 24" fill="${isFav(p.id) ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 21s-7.5-4.7-9.5-9A5.4 5.4 0 0 1 12 6.6 5.4 5.4 0 0 1 21.5 12c-2 4.3-9.5 9-9.5 9z"/></svg>
          </button>
          <button class="alm-iconbtn" id="btn-share" aria-label="Share this piece">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>
          </button>
        </div>
        <div id="player-slot"></div>
        ${listenLinksHTML(p)}
        <p class="alm-ctx">${esc(p.context)}</p>
        ${p.listenFor ? `<div class="alm-listenfor"><strong>Listen for</strong> — ${esc(p.listenFor)}</div>` : ""}
        ${p.recordingNote ? `<p class="alm-recnote">${esc(p.recordingNote)}</p>` : ""}
      </div>
    </main>`;
  document.getElementById("btn-play").addEventListener("click", () => loadPlayer(p));
  document.getElementById("btn-fav").addEventListener("click", (ev) => {
    const saved = toggleFav(p.id);
    ev.currentTarget.setAttribute("aria-pressed", String(saved));
    ev.currentTarget.querySelector("svg").setAttribute("fill", saved ? "currentColor" : "none");
    toast(saved ? "Saved to your favourites" : "Removed from favourites");
  });
  document.getElementById("btn-share").addEventListener("click", () => sharePiece(p));
}

// ---- player ----
function loadPlayer(piece) {
  const slot = document.getElementById("player-slot");
  if (!slot || slot.querySelector("iframe")) return;
  const pb = piece.playback || {};

  // Spotify: official embedded widget, no API key or viewer account needed.
  if (pb.provider === "spotify") {
    const id = esc(pb.videoId);
    slot.innerHTML = `
      <div class="alm-player">
        <iframe src="https://open.spotify.com/embed/track/${id}" width="100%" height="152"
          frameborder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy" title="Spotify player"></iframe>
      </div>`;
    return;
  }

  // YouTube (default): official no-cookie embed, created only on tap.
  slot.innerHTML = `<div class="alm-player"><div id="yt-mount"></div></div>`;
  const mount = document.getElementById("yt-mount");

  function createPlayer() {
    ytPlayer = new YT.Player(mount, {
      videoId: pb.videoId,
      host: "https://www.youtube-nocookie.com",
      playerVars: { rel: 0, playsinline: 1 },
      events: {
        onError: () => showPlayerError(piece),
      },
    });
  }

  if (ytReady) createPlayer();
  else {
    ytPending = createPlayer;
    if (!document.getElementById("yt-api")) {
      const s = document.createElement("script");
      s.id = "yt-api";
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }
  }
}

window.onYouTubeIframeAPIReady = () => {
  ytReady = true;
  if (ytPending) { const f = ytPending; ytPending = null; f(); }
};

function showPlayerError(piece) {
  const slot = document.getElementById("player-slot");
  if (!slot) return;
  const links = listenLinks(piece);
  const primary = piece.playback.provider === "spotify" ? "Spotify" : "YouTube";
  const linkHTML = `You can <a href="${esc(piece.playback.watchUrl)}" target="_blank" rel="noopener">listen on ${primary}</a>` +
    (links.length ? ` or try ${links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(linkLabel(l))}</a>`).join(", ")}` : "");
  slot.innerHTML = `
    <div class="alm-player-error">
      This recording can’t play here right now — it may be restricted in your region or the uploader may have disabled embedding.
      ${linkHTML}.
    </div>`;
}

// ---- share ----
function sharePiece(p) {
  const url = location.origin + location.pathname + "#/piece/" + p.id;
  const text = `${p.title} — ${p.performer}. Today’s little discovery:`;
  if (navigator.share) {
    navigator.share({ title: `${p.title} — ${ALM_CONFIG.appName}`, text, url }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(`${text} ${url}`);
    toast("Link copied");
  }
}

// ---- misc UI ----
function emptyState(msg, sub) {
  return `<div class="alm-empty"><span class="alm-art-glyph">♪</span>${msg}<br>${sub || ""}</div>`;
}

let toastTimer = null;
function toast(msg) {
  let t = document.querySelector(".alm-toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "alm-toast";
    t.setAttribute("role", "status");
    document.body.appendChild(t);
  }
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- routing -----------------------------------------------------------
function route() {
  const h = location.hash || "#/today";
  destroyPlayer();
  if (h.startsWith("#/piece/")) renderPiece(h.slice("#/piece/".length));
  else if (h.startsWith("#/archive")) renderArchive();
  else if (h.startsWith("#/favourites")) renderFavourites();
  else if (h.startsWith("#/settings")) renderSettings();
  else renderToday();
  document.querySelectorAll(".alm-tab").forEach((a) => {
    const key = a.dataset.nav;
    const active =
      (key === "today" && (h === "#/today" || h === "")) ||
      h.startsWith("#/" + key);
    if (active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  window.scrollTo(0, 0);
}

function destroyPlayer() {
  if (ytPlayer) {
    try { ytPlayer.destroy(); } catch {}
    ytPlayer = null;
  }
}

window.addEventListener("hashchange", route);

// ---------- boot --------------------------------------------------------------
(async function boot() {
  try {
    const res = await fetch(ALM_CONFIG.catalogueUrl);
    catalogue = await res.json();
    if (!Array.isArray(catalogue)) throw new Error("catalogue must be a JSON array");
    byId = new Map(catalogue.map((e) => [e.id, e]));
  } catch (err) {
    document.getElementById("app").innerHTML =
      emptyState("The catalogue could not be loaded.", String(err.message || err));
    return;
  }
  route();
})();
