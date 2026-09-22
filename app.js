const CONFIG = {
  clientId: "be1d4ce0d9ff4d4eb5a28a4a175c5e33",
  redirectUri: window.location.origin + window.location.pathname,
  scope: "playlist-read-private"
};

const $ = (s) => document.querySelector(s);

const state = {
  token: null,
  playlists: [],
  selected: null,
  songs: [],
  round: 0,
  score: 0,
  clipIndex: 0,
  clips: [0.1, 0.5, 1, 2, 5],
  current: null,
  audioUrl: null,
  roundLocked: false,
  answerSubmitted: false,
  searchTimer: null
};

const els = {
  spotifyBtn: $("#spotifyBtn"), status: $("#status"), playlistList: $("#playlistList"),
  startBtn: $("#startBtn"), setup: $("#setup"), game: $("#game"), result: $("#result"),
  playlistTitle: $("#playlistTitle"), roundLabel: $("#roundLabel"), progressBar: $("#progressBar"),
  timer: $("#timer"), playBtn: $("#playBtn"), skipBtn: $("#skipBtn"), answer: $("#guess"),
  suggestions: $("#suggestions"), answerBtn: $("#answerBtn"), answerBox: $("#answerBox"),
  audio: $("#audio"), score: $("#score"), resultText: $("#resultText"), againBtn: $("#againBtn"),
  quitBtn: $("#quitBtn"), hint: $("#hint")
};

function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(s) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
}

function randomString(n = 64) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return [...a].map(x => (x % 36).toString(36)).join("");
}

function normalize(s) {
  return String(s || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
  }[m]));
}

async function login() {
  if (CONFIG.clientId.startsWith("YOUR_")) {
    alert("Ajoute ton Spotify Client ID dans app.js, ligne 2.");
    return;
  }
  const verifier = randomString();
  const challenge = base64url(await sha256(verifier));
  localStorage.setItem("pkce_verifier", verifier);
  const stateToken = randomString(16);
  localStorage.setItem("oauth_state", stateToken);

  const u = new URL("https://accounts.spotify.com/authorize");
  u.search = new URLSearchParams({
    client_id: CONFIG.clientId,
    response_type: "code",
    redirect_uri: CONFIG.redirectUri,
    scope: CONFIG.scope,
    state: stateToken,
    code_challenge_method: "S256",
    code_challenge: challenge
  });
  location.href = u;
}

async function exchangeCode(code) {
  const verifier = localStorage.getItem("pkce_verifier");
  if (!verifier) throw new Error("Session de connexion introuvable. Recommence la connexion Spotify.");

  const body = new URLSearchParams({
    client_id: CONFIG.clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: CONFIG.redirectUri,
    code_verifier: verifier
  });

  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!r.ok) throw new Error("Impossible d'obtenir le token Spotify.");

  const d = await r.json();
  state.token = d.access_token;
  localStorage.setItem("spotify_token", state.token);
  history.replaceState({}, "", CONFIG.redirectUri);
  localStorage.removeItem("pkce_verifier");
  localStorage.removeItem("oauth_state");
}

async function spotify(path) {
  const r = await fetch("https://api.spotify.com/v1" + path, {
    headers: { Authorization: `Bearer ${state.token}` }
  });
  if (r.status === 401) {
    localStorage.removeItem("spotify_token");
    state.token = null;
    throw new Error("Session Spotify expirée.");
  }
  if (!r.ok) throw new Error(`Spotify ${r.status}`);
  return r.json();
}

async function loadPlaylists() {
  state.playlists = [];
  let url = "/me/playlists?limit=50";
  while (url) {
    const d = await spotify(url);
    state.playlists.push(...(d.items || []));
    url = d.next ? new URL(d.next).pathname + new URL(d.next).search : "";
  }
  renderPlaylists();
}

function renderPlaylists() {
  els.status.textContent = `${state.playlists.length} playlist${state.playlists.length > 1 ? "s" : ""}`;
  els.playlistList.innerHTML = "";

  state.playlists.filter(p => p?.id).forEach(p => {
    const b = document.createElement("button");
    b.className = "playlist";
    b.innerHTML = `
      <img src="${p.images?.[0]?.url || ""}" alt="">
      <div><strong>${esc(p.name)}</strong><span>${p.items?.total ?? p.tracks?.total ?? ""} titres</span></div>`;
    b.onclick = () => {
      document.querySelectorAll(".playlist").forEach(x => x.classList.remove("selected"));
      b.classList.add("selected");
      state.selected = p;
      els.startBtn.disabled = false;
    };
    els.playlistList.appendChild(b);
  });
}

async function loadSongs(id) {
  const songs = [];
  let url = `/playlists/${encodeURIComponent(id)}/items?limit=50&market=FR`;
  while (url) {
    const d = await spotify(url);
    for (const x of d.items || []) {
      const t = x.item;
      if (t?.type === "track" && t.name) songs.push(t);
    }
    url = d.next ? new URL(d.next).pathname + new URL(d.next).search : "";
  }
  return songs;
}

function chooseSong() {
  state.current = state.songs[Math.floor(Math.random() * state.songs.length)];
  state.clipIndex = 0;
  state.roundLocked = false;
  state.answerSubmitted = false;
  state.audioUrl = null;

  els.answer.value = "";
  els.suggestions.innerHTML = "";
  els.suggestions.classList.add("hidden");
  els.answerBox.className = "answer-result hidden";
  els.answerBtn.disabled = false;
  els.skipBtn.disabled = false;
  els.playBtn.disabled = false;
  els.timer.textContent = `${state.clips[0]} s`;
  els.hint.textContent = "Écoute l’extrait puis choisis ou écris ta réponse.";
  els.roundLabel.textContent = `Manche ${state.round + 1} / ${state.songs.length}`;
  els.progressBar.style.width = `${(state.round / state.songs.length) * 100}%`;
  setAudioPreview();
}

async function setAudioPreview() {
  els.audio.pause();
  els.audio.removeAttribute("src");
  state.audioUrl = null;

  const title = state.current.name;
  const artist = state.current.artists?.[0]?.name || "";
  const q = encodeURIComponent(`${title} ${artist}`);

  try {
    const r = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=10&country=FR`);
    if (!r.ok) throw new Error("iTunes error");
    const d = await r.json();
    const wantedTitle = normalize(title);
    const wantedArtist = normalize(artist);
    const hits = (d.results || []).filter(x => x.previewUrl);

    const exact = hits.find(x => normalize(x.trackName) === wantedTitle && normalize(x.artistName).includes(wantedArtist));
    const titleOnly = hits.find(x => normalize(x.trackName) === wantedTitle);
    const artistOnly = hits.find(x => normalize(x.artistName).includes(wantedArtist));
    const hit = exact || titleOnly || artistOnly || hits[0];

    if (hit?.previewUrl) {
      state.audioUrl = hit.previewUrl;
      els.audio.src = hit.previewUrl;
      els.audio.load();
      els.hint.textContent = "Extrait disponible. Appuie sur ▶ pour écouter.";
    } else {
      els.hint.textContent = "Aucun extrait disponible pour ce titre.";
    }
  } catch {
    els.hint.textContent = "Impossible de charger l’extrait.";
  }
}

async function playClip() {
  if (state.roundLocked) return;
  if (!els.audio.src) await setAudioPreview();
  if (!els.audio.src) return;

  const duration = state.clips[state.clipIndex];
  els.audio.currentTime = 0;
  els.timer.textContent = `${duration} s`;

  try {
    await els.audio.play();
  } catch {
    return;
  }

  setTimeout(() => {
    if (!state.roundLocked) els.audio.pause();
  }, duration * 1000);
}

function renderSuggestions() {
  const q = normalize(els.answer.value);
  if (!q) {
    els.suggestions.innerHTML = "";
    els.suggestions.classList.add("hidden");
    return;
  }

  const matches = state.songs.filter(song => {
    const title = normalize(song.name);
    const artists = normalize((song.artists || []).map(a => a.name).join(" "));
    return title.includes(q) || artists.includes(q);
  }).slice(0, 8);

  els.suggestions.innerHTML = "";
  matches.forEach(song => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "suggestion";
    b.innerHTML = `<strong>${esc(song.name)}</strong><span>${esc((song.artists || []).map(a => a.name).join(", "))}</span>`;
    b.onclick = () => {
      els.answer.value = song.name;
      els.suggestions.classList.add("hidden");
      submit();
    };
    els.suggestions.appendChild(b);
  });

  els.suggestions.classList.toggle("hidden", matches.length === 0);
}

function answerIsCorrect(guess) {
  const title = normalize(state.current.name);
  const artists = normalize((state.current.artists || []).map(a => a.name).join(" "));
  const g = normalize(guess);
  return g === title || title === g || (g.length >= 3 && title.includes(g)) || (g.length >= 3 && artists.includes(g));
}

function reveal(correct, guess) {
  state.roundLocked = true;
  els.audio.pause();
  els.playBtn.disabled = true;
  els.skipBtn.disabled = true;
  els.answerBtn.disabled = true;
  els.suggestions.classList.add("hidden");

  const t = state.current;
  const artist = (t.artists || []).map(a => a.name).join(", ");
  const guessed = guess?.trim() ? `<div class="guess-line">Ta réponse : <strong>${esc(guess)}</strong></div>` : "";

  els.answerBox.className = `answer-result ${correct ? "correct" : "wrong"}`;
  els.answerBox.innerHTML = `
    <div class="result-icon">${correct ? "✓" : "✕"}</div>
    <div class="result-main">
      <strong>${correct ? "Bonne réponse !" : "Mauvaise réponse"}</strong>
      ${guessed}
      <div class="solution"><b>${esc(t.name)}</b><span>${esc(artist)}</span></div>
    </div>
    <button class="continue-btn" id="continueBtn">Continuer</button>`;

  $("#continueBtn").onclick = nextRound;
}

function submit() {
  if (!state.current || state.roundLocked || state.answerSubmitted) return;
  const guess = els.answer.value.trim();
  if (!guess) return;

  state.answerSubmitted = true;
  const correct = answerIsCorrect(guess);
  if (correct) state.score++;
  reveal(correct, guess);
}

function skip() {
  if (state.roundLocked) return;
  if (state.clipIndex < state.clips.length - 1) {
    state.clipIndex++;
    els.timer.textContent = `${state.clips[state.clipIndex]} s`;
    playClip();
  } else {
    reveal(false, "");
  }
}

function nextRound() {
  if (!state.roundLocked) return;
  state.round++;
  if (state.round >= state.songs.length) {
    endGame();
    return;
  }
  chooseSong();
}

function endGame() {
  els.game.classList.add("hidden");
  els.result.classList.remove("hidden");
  els.progressBar.style.width = "100%";
  els.score.textContent = `${state.score} / ${state.songs.length}`;
  els.resultText.textContent = "Partie terminée. Tu peux relancer une partie avec la même playlist.";
}

async function start() {
  if (!state.selected) return;
  els.startBtn.disabled = true;
  els.status.textContent = "Chargement des titres…";
  try {
    state.songs = await loadSongs(state.selected.id);
    if (!state.songs.length) throw new Error("Cette playlist ne contient aucun titre accessible.");
    state.round = 0;
    state.score = 0;
    els.setup.classList.add("hidden");
    els.result.classList.add("hidden");
    els.game.classList.remove("hidden");
    els.playlistTitle.textContent = state.selected.name;
    chooseSong();
    els.status.textContent = "Prêt";
  } catch (e) {
    alert(e.message || "Impossible de charger la playlist.");
    els.startBtn.disabled = false;
  }
}

function init() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const returnedState = params.get("state");

  if (code) {
    if (returnedState !== localStorage.getItem("oauth_state")) {
      alert("État OAuth invalide. Recommence la connexion Spotify.");
      return;
    }
    exchangeCode(code).then(loadPlaylists).then(() => {
      els.spotifyBtn.textContent = "Spotify connecté";
      els.status.textContent = "Choisis une playlist";
    }).catch(e => alert(e.message));
  } else {
    const token = localStorage.getItem("spotify_token");
    if (token) {
      state.token = token;
      els.spotifyBtn.textContent = "Spotify connecté";
      loadPlaylists().catch(() => {});
    }
  }
}

els.spotifyBtn.onclick = login;
els.startBtn.onclick = start;
els.playBtn.onclick = playClip;
els.skipBtn.onclick = skip;
els.answerBtn.onclick = submit;
els.answer.addEventListener("input", () => {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(renderSuggestions, 80);
});
els.answer.addEventListener("keydown", e => {
  if (e.key === "Enter") submit();
  if (e.key === "Escape") els.suggestions.classList.add("hidden");
});
els.quitBtn.onclick = () => location.reload();
els.againBtn.onclick = () => {
  els.result.classList.add("hidden");
  els.setup.classList.remove("hidden");
  state.round = 0;
  state.score = 0;
  state.selected = null;
  els.startBtn.disabled = true;
  document.querySelectorAll(".playlist").forEach(x => x.classList.remove("selected"));
};

init();
