/* ============================================================
   Flappy Bird – vollständiger Klon (reines JavaScript)

   Features:
   - Menü, Shop, Einstellungen (3 Schwierigkeitsstufen)
   - Schwierigkeit beeinflusst Score-Multiplikator & Tempo
   - Geschwindigkeit steigt mit der Distanz bis zu einem
     stufenabhängigen Maximum
   - Coins zum Einsammeln → im Shop neue Skins kaufen
   - Steuerung: Leertaste / ↑ / W / Mausklick / Touch
   ============================================================ */
(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;   // 400
  const H = canvas.height;  // 600

  // ---------- Konstanten ----------
  const GROUND_H = 90;
  const PLAY_BOTTOM = H - GROUND_H;
  const GRAVITY = 1500;
  const FLAP_VELOCITY = -420;
  const MAX_FALL_SPEED = 750;
  const PIPE_WIDTH = 70;
  const PIPE_SPACING = 220;     // horizontaler Abstand der Röhrenpaare
  const BIRD_X = 110;
  const BIRD_R = 14;
  const COIN_R = 13;

  // ---------- Schwierigkeitsstufen ----------
  // gap        = Lücke zwischen den Röhren
  // baseSpeed  = Start-Tempo
  // maxSpeed   = maximales Tempo (einfach niedriger als schwer)
  // accel      = Tempo-Zuwachs pro passierter Röhre
  // scoreMult  = Punkte pro Röhre (einfach steigt der Score langsam)
  const DIFFICULTIES = {
    easy:   { key: "easy",   name: "Einfach", color: "#3ad17a", gap: 180, baseSpeed: 125, maxSpeed: 190, accel: 2.5, scoreMult: 1 },
    medium: { key: "medium", name: "Mittel",  color: "#ffb03a", gap: 150, baseSpeed: 150, maxSpeed: 265, accel: 4.0, scoreMult: 2 },
    hard:   { key: "hard",   name: "Schwer",  color: "#ff5a5a", gap: 128, baseSpeed: 175, maxSpeed: 350, accel: 5.5, scoreMult: 3 },
  };

  // ---------- Skins ----------
  const SKINS = [
    { id: "classic", name: "Klassik",  price: 0,   body: "#f8d147", belly: "#fdf2cd", wing: "#f3c33a", beak: "#f3722c" },
    { id: "red",     name: "Rubin",    price: 15,  body: "#ff5a5a", belly: "#ffd2d2", wing: "#e23d3d", beak: "#ffb03a" },
    { id: "blue",    name: "Saphir",   price: 30,  body: "#4aa3ff", belly: "#d2e8ff", wing: "#2f86e6", beak: "#ffb03a" },
    { id: "green",   name: "Smaragd",  price: 50,  body: "#3ad17a", belly: "#cdf5dd", wing: "#22b061", beak: "#ff9a3a" },
    { id: "purple",  name: "Amethyst", price: 90,  body: "#b06aff", belly: "#e7d2ff", wing: "#9148e6", beak: "#ffb03a" },
    { id: "pink",    name: "Flamingo", price: 140, body: "#ff7ac4", belly: "#ffd6ee", wing: "#ec57a8", beak: "#ffb03a" },
    { id: "gold",    name: "Gold",     price: 250, body: "#ffd700", belly: "#fff3b0", wing: "#e6b800", beak: "#e08a1e", shine: true },
    { id: "shadow",  name: "Schatten", price: 400, body: "#3a3f4b", belly: "#5a6072", wing: "#23262e", beak: "#ff5a5a", shine: true },
  ];

  // ---------- Persistenter Speicher ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} },
  };
  let coins = parseInt(store.get("flappy-coins", "0"), 10) || 0;
  let owned = new Set((store.get("flappy-owned", "classic") || "classic").split(",").filter(Boolean));
  owned.add("classic");
  let currentSkin = store.get("flappy-skin", "classic");
  if (!SKINS.some(s => s.id === currentSkin)) currentSkin = "classic";
  let difficultyKey = store.get("flappy-difficulty", "medium");
  if (!DIFFICULTIES[difficultyKey]) difficultyKey = "medium";
  function bestKey() { return "flappy-best-" + difficultyKey; }
  function getBest() { return parseInt(store.get(bestKey(), "0"), 10) || 0; }
  function saveCoins() { store.set("flappy-coins", coins); }
  function saveOwned() { store.set("flappy-owned", Array.from(owned).join(",")); }

  function skinById(id) { return SKINS.find(s => s.id === id) || SKINS[0]; }

  // ---------- Zustände ----------
  const State = { MENU: 0, SHOP: 1, READY: 2, PLAYING: 3, DYING: 4, GAMEOVER: 5 };
  let state = State.MENU;
  let overlay = null;          // null | "settings"
  let shopScroll = 0;

  // ---------- Spielvariablen ----------
  let bird = { y: H / 2, vy: 0, rot: 0, wingFrame: 0, wingTimer: 0 };
  let pipes = [];              // { x, gapY, scored }
  let coinEnts = [];           // { x, y, phase, collected }
  let score = 0;
  let pipesPassed = 0;
  let speed = DIFFICULTIES[difficultyKey].baseSpeed;
  let coinsThisRun = 0;
  let groundX = 0, bgX = 0, cloudX = 0;
  let lastTime = 0;
  let flashAlpha = 0;
  let gameOverTimer = 0;
  let animT = 0;               // globaler Animationstakt
  let newBest = false;
  let toast = null;            // { text, t }
  let particles = [];          // Coin-Sammel-Funken

  // ---------- Sound (WebAudio) ----------
  let audioCtx = null;
  function sound(freq, dur, type = "square", vol = 0.15, slide = 0) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), audioCtx.currentTime + dur);
      g.gain.setValueAtTime(vol, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + dur);
    } catch (e) {}
  }
  const sfx = {
    flap:  () => sound(500, 0.08, "square", 0.08, 200),
    score: () => { sound(880, 0.07, "square", 0.1); setTimeout(() => sound(1320, 0.09, "square", 0.1), 70); },
    coin:  () => { sound(1180, 0.06, "sine", 0.12); setTimeout(() => sound(1760, 0.1, "sine", 0.12), 55); },
    hit:   () => sound(200, 0.25, "sawtooth", 0.18, -150),
    die:   () => sound(400, 0.4, "sawtooth", 0.12, -350),
    click: () => sound(660, 0.06, "square", 0.08),
    buy:   () => { sound(740, 0.08, "triangle", 0.12); setTimeout(() => sound(990, 0.08, "triangle", 0.12), 80); setTimeout(() => sound(1320, 0.12, "triangle", 0.12), 160); },
    deny:  () => sound(160, 0.18, "sawtooth", 0.14, -40),
  };

  // ============================================================
  //  Eingabe
  // ============================================================
  let hitRegions = [];         // { x, y, w, h, action } – jeden Frame neu aufgebaut

  function getPos(e) {
    const r = canvas.getBoundingClientRect();
    const src = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
    return {
      x: (src.clientX - r.left) * (W / r.width),
      y: (src.clientY - r.top) * (H / r.height),
    };
  }

  function onPointerDown(e) {
    e.preventDefault();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();

    // Im Spiel: überall tippen = flattern
    if (state === State.PLAYING) { flap(); return; }
    if (state === State.READY) { state = State.PLAYING; flap(); return; }
    if (state === State.DYING) return;

    // Menü / Shop / Game Over / Overlay: Buttons treffen
    const p = getPos(e);
    for (let i = hitRegions.length - 1; i >= 0; i--) {
      const r = hitRegions[i];
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        sfx.click();
        r.action();
        return;
      }
    }
  }

  function flap() { bird.vy = FLAP_VELOCITY; bird.rot = -0.45; sfx.flap(); }

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
      e.preventDefault();
      if (e.repeat) return;
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
      if (state === State.MENU && !overlay) startReady();
      else if (state === State.READY) { state = State.PLAYING; flap(); }
      else if (state === State.PLAYING) flap();
      else if (state === State.GAMEOVER && gameOverTimer > 0.7) startReady();
    } else if (e.code === "Escape") {
      if (overlay) overlay = null;
      else if (state === State.SHOP) state = State.MENU;
    }
  });
  canvas.addEventListener("mousedown", onPointerDown);
  canvas.addEventListener("touchstart", onPointerDown, { passive: false });

  // ============================================================
  //  Spielablauf
  // ============================================================
  function startReady() {
    state = State.READY;
    bird = { y: H / 2 - 20, vy: 0, rot: 0, wingFrame: 0, wingTimer: 0 };
    pipes = [];
    coinEnts = [];
    particles = [];
    score = 0;
    pipesPassed = 0;
    coinsThisRun = 0;
    speed = DIFFICULTIES[difficultyKey].baseSpeed;
    flashAlpha = 0;
    gameOverTimer = 0;
    newBest = false;
  }

  function spawnPipe(x) {
    const d = DIFFICULTIES[difficultyKey];
    const margin = 55;
    const minY = margin + d.gap / 2;
    const maxY = PLAY_BOTTOM - margin - d.gap / 2;
    const gapY = minY + Math.random() * (maxY - minY);
    pipes.push({ x, gapY, scored: false });
    // Mit Wahrscheinlichkeit eine Münze in der Mitte zur nächsten Röhre
    if (Math.random() < 0.65) {
      coinEnts.push({ x: x + PIPE_SPACING / 2, y: gapY + (Math.random() - 0.5) * 40, phase: Math.random() * 6, collected: false });
    }
  }

  function die() {
    if (state !== State.PLAYING) return;
    state = State.DYING;
    flashAlpha = 1;
    sfx.hit();
    setTimeout(() => sfx.die(), 150);
    const best = getBest();
    if (score > best) { store.set(bestKey(), score); newBest = true; }
    // Gesammelte Coins gutschreiben
    coins += coinsThisRun;
    saveCoins();
  }

  function update(dt) {
    animT += dt;
    if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }

    // Flügelschlag
    bird.wingTimer += dt;
    if (bird.wingTimer > 0.09) { bird.wingTimer = 0; bird.wingFrame = (bird.wingFrame + 1) % 4; }

    // Hintergrund scrollen (in ruhenden Screens langsam weiter)
    const scroll = (state === State.DYING || state === State.GAMEOVER) ? 0 : (state === State.PLAYING ? speed : 60);
    groundX = (groundX - scroll * dt) % 24;
    bgX = (bgX - scroll * 0.2 * dt) % W;
    cloudX = (cloudX - scroll * 0.35 * dt) % W;

    // Partikel
    for (const pt of particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; }
    particles = particles.filter(pt => pt.life > 0);

    if (state === State.MENU || state === State.SHOP || state === State.READY) {
      const baseY = state === State.READY ? H / 2 - 20 : H / 2 - 40;
      bird.y = baseY + Math.sin(animT * 3) * 9;
      bird.rot = Math.sin(animT * 3) * 0.12;
      return;
    }

    if (state === State.PLAYING || state === State.DYING) {
      bird.vy = Math.min(bird.vy + GRAVITY * dt, MAX_FALL_SPEED);
      bird.y += bird.vy * dt;
      const target = bird.vy < 0 ? -0.45 : Math.min(1.4, bird.vy / 350);
      bird.rot += (target - bird.rot) * Math.min(1, dt * 12);

      if (bird.y < BIRD_R) { bird.y = BIRD_R; bird.vy = 0; }
      if (bird.y > PLAY_BOTTOM - BIRD_R) { bird.y = PLAY_BOTTOM - BIRD_R; bird.vy = 0; die(); state = State.GAMEOVER; }
    }

    if (state === State.PLAYING) {
      const d = DIFFICULTIES[difficultyKey];
      // Tempo steigt mit der Distanz bis zum Maximum
      speed = Math.min(d.maxSpeed, d.baseSpeed + pipesPassed * d.accel);

      for (const p of pipes) p.x -= speed * dt;
      for (const c of coinEnts) c.x -= speed * dt;

      if (pipes.length === 0) spawnPipe(W + 60);
      else if (pipes[pipes.length - 1].x < W - PIPE_SPACING) spawnPipe(pipes[pipes.length - 1].x + PIPE_SPACING);

      pipes = pipes.filter(p => p.x > -PIPE_WIDTH);
      coinEnts = coinEnts.filter(c => c.x > -40 && !c.collected);

      for (const p of pipes) {
        if (!p.scored && p.x + PIPE_WIDTH < BIRD_X) {
          p.scored = true;
          pipesPassed++;
          score += d.scoreMult;
          sfx.score();
        }
        if (collides(p)) die();
      }

      // Münzen einsammeln
      for (const c of coinEnts) {
        c.phase += dt * 6;
        const dx = c.x - BIRD_X, dy = c.y - bird.y;
        if (!c.collected && dx * dx + dy * dy < (BIRD_R + COIN_R) * (BIRD_R + COIN_R)) {
          c.collected = true;
          coinsThisRun++;
          sfx.coin();
          for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 80;
            particles.push({ x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5, max: 0.5 });
          }
        }
      }
    }

    if (state === State.DYING || state === State.GAMEOVER) {
      gameOverTimer += dt;
      flashAlpha = Math.max(0, flashAlpha - dt * 3);
    }
  }

  function collides(p) {
    const d = DIFFICULTIES[difficultyKey];
    const top = { x: p.x, y: 0, w: PIPE_WIDTH, h: p.gapY - d.gap / 2 };
    const bot = { x: p.x, y: p.gapY + d.gap / 2, w: PIPE_WIDTH, h: PLAY_BOTTOM - (p.gapY + d.gap / 2) };
    return circleRect(BIRD_X, bird.y, BIRD_R, top) || circleRect(BIRD_X, bird.y, BIRD_R, bot);
  }
  function circleRect(cx, cy, r, rect) {
    const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
    const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  // ============================================================
  //  Zeichnen
  // ============================================================
  function draw() {
    hitRegions = [];
    drawBackground();
    drawPipes();
    drawCoins();
    drawParticles();
    drawGround();

    if (state !== State.SHOP) drawBird(BIRD_X, bird.y, bird.rot, bird.wingFrame, skinById(currentSkin));

    switch (state) {
      case State.MENU: drawMenu(); break;
      case State.SHOP: drawShop(); break;
      case State.READY: drawReady(); break;
      case State.PLAYING: drawHud(); break;
      case State.DYING:
      case State.GAMEOVER: drawHud(); drawGameOver(); break;
    }

    if (overlay === "settings") drawSettings();
    if (toast) drawToast();

    if (flashAlpha > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#4ec0ca");
    sky.addColorStop(0.7, "#7fdde6");
    sky.addColorStop(1, "#aeeef2");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    for (let off = 0; off < 2; off++) {
      const x0 = cloudX + off * W;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      drawCloud(x0 + 50, 110, 1.0);
      drawCloud(x0 + 210, 70, 0.7);
      drawCloud(x0 + 330, 150, 0.85);
    }

    const cityY = PLAY_BOTTOM;
    for (let off = 0; off < 2; off++) {
      const x0 = bgX + off * W;
      ctx.fillStyle = "#c8f0d8";
      const buildings = [[10,60,36],[55,90,30],[95,50,40],[145,75,28],[180,55,45],[235,95,26],[270,65,38],[318,80,32],[358,50,40]];
      for (const [bx, bh, bw] of buildings) ctx.fillRect(x0 + bx, cityY - bh, bw, bh);
      ctx.fillStyle = "#9ce3b0";
      for (let i = 0; i < 10; i++) { ctx.beginPath(); ctx.arc(x0 + i * 42 + 8, cityY, 16, Math.PI, 0); ctx.fill(); }
    }
  }
  function drawCloud(x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 18 * s, 0, Math.PI * 2);
    ctx.arc(x + 20 * s, y - 8 * s, 14 * s, 0, Math.PI * 2);
    ctx.arc(x + 40 * s, y, 16 * s, 0, Math.PI * 2);
    ctx.arc(x + 20 * s, y + 6 * s, 15 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPipes() {
    const d = DIFFICULTIES[difficultyKey];
    for (const p of pipes) {
      const topH = p.gapY - d.gap / 2;
      const botY = p.gapY + d.gap / 2;
      drawPipe(p.x, 0, topH, true);
      drawPipe(p.x, botY, PLAY_BOTTOM - botY, false);
    }
  }
  function drawPipe(x, y, h, isTop) {
    if (h <= 0) return;
    const capH = 26, cs = 4;
    const body = ctx.createLinearGradient(x, 0, x + PIPE_WIDTH, 0);
    body.addColorStop(0, "#578a2a"); body.addColorStop(0.15, "#9ade49"); body.addColorStop(0.45, "#c7f06e");
    body.addColorStop(0.7, "#74b834"); body.addColorStop(1, "#46701f");
    ctx.fillStyle = body;
    ctx.fillRect(x, y, PIPE_WIDTH, h);
    ctx.strokeStyle = "#2e4d14"; ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y - 2, PIPE_WIDTH - 2, h + 4);
    const capY = isTop ? y + h - capH : y;
    const cap = ctx.createLinearGradient(x - cs, 0, x + PIPE_WIDTH + cs, 0);
    cap.addColorStop(0, "#578a2a"); cap.addColorStop(0.15, "#a8e85a"); cap.addColorStop(0.45, "#d2f47e");
    cap.addColorStop(0.7, "#7cc23a"); cap.addColorStop(1, "#46701f");
    ctx.fillStyle = cap;
    ctx.fillRect(x - cs, capY, PIPE_WIDTH + cs * 2, capH);
    ctx.strokeRect(x - cs + 1, capY + 1, PIPE_WIDTH + cs * 2 - 2, capH - 2);
  }

  function drawCoins() {
    for (const c of coinEnts) if (!c.collected) drawCoin(c.x, c.y, COIN_R, c.phase);
  }
  function drawCoin(x, y, r, phase) {
    const sx = Math.abs(Math.cos(phase)); // Rotations-Illusion
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(Math.max(0.15, sx), 1);
    const g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, "#ffe680"); g.addColorStop(0.5, "#ffcc33"); g.addColorStop(1, "#e0a818");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#b9860b"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#fff2b0";
    ctx.font = `bold ${r}px Arial`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("★", 0, 1);
    ctx.restore();
  }
  function drawParticles() {
    for (const pt of particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = "#ffd84a";
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawGround() {
    const gy = PLAY_BOTTOM;
    ctx.fillStyle = "#ded895"; ctx.fillRect(0, gy, W, GROUND_H);
    ctx.fillStyle = "#73bf2e"; ctx.fillRect(0, gy, W, 14);
    ctx.fillStyle = "#9be060";
    for (let x = groundX - 24; x < W + 24; x += 24) {
      ctx.beginPath(); ctx.moveTo(x, gy + 14); ctx.lineTo(x + 12, gy); ctx.lineTo(x + 24, gy + 14); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = "#5a9e22"; ctx.fillRect(0, gy + 14, W, 3);
    ctx.fillStyle = "#cbc27c";
    for (let x = groundX - 24; x < W + 24; x += 24)
      for (let row = 0; row < 3; row++) ctx.fillRect(x + (row % 2) * 12, gy + 30 + row * 18, 8, 8);
  }

  function drawBird(px, py, rot, wingFrame, skin) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.lineWidth = 2; ctx.strokeStyle = "#5b4a14";

    // Körper
    ctx.fillStyle = skin.body;
    ctx.beginPath(); ctx.ellipse(0, 0, 17, 13, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (skin.shine) {
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath(); ctx.ellipse(-4, -5, 7, 4, -0.5, 0, Math.PI * 2); ctx.fill();
    }
    // Bauch
    ctx.fillStyle = skin.belly;
    ctx.beginPath(); ctx.ellipse(-2, 5, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
    // Flügel (4 Phasen)
    const wingY = [-3, 1, 5, 1][wingFrame];
    ctx.fillStyle = skin.wing;
    ctx.beginPath(); ctx.ellipse(-5, wingY, 8.5, 5.5, -0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Auge
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(7, -4, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#2b2b2b";
    ctx.beginPath(); ctx.arc(8.5, -4, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(9.5, -5, 1, 0, Math.PI * 2); ctx.fill();
    // Schnabel
    ctx.fillStyle = skin.beak;
    ctx.beginPath(); ctx.moveTo(12, 1); ctx.lineTo(23, 3); ctx.lineTo(12, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // ---------- UI-Helfer ----------
  function text(t, x, y, size, fill = "#fff", align = "center", weight = "bold") {
    ctx.font = `${weight} ${size}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(3, size / 8); ctx.lineJoin = "round";
    ctx.strokeStyle = "#3b3b3b"; ctx.strokeText(t, x, y);
    ctx.fillStyle = fill; ctx.fillText(t, x, y);
  }
  function plainText(t, x, y, size, fill, align = "center", weight = "normal") {
    ctx.font = `${weight} ${size}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = "middle";
    ctx.fillStyle = fill; ctx.fillText(t, x, y);
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function button(label, x, y, w, h, action, opts = {}) {
    const bg = opts.bg || "#ffce4a";
    const bd = opts.border || "#c98f1e";
    const tc = opts.textColor || "#5a3d00";
    const pulse = opts.pulse ? 1 + Math.sin(animT * 5) * 0.025 : 1;
    const dw = w * pulse, dh = h * pulse;
    const dx = x - (dw - w) / 2, dy = y - (dh - h) / 2;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
    ctx.fillStyle = bg; roundRect(dx, dy, dw, dh, opts.radius != null ? opts.radius : 12); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = bd; ctx.lineWidth = 3; roundRect(dx, dy, dw, dh, opts.radius != null ? opts.radius : 12); ctx.stroke();
    if (label) {
      ctx.font = `bold ${opts.fontSize || 22}px "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = tc; ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    }
    if (action) hitRegions.push({ x, y, w, h, action });
    return { x, y, w, h };
  }

  // Kleine Coin-Anzeige
  function coinBadge(x, y, value) {
    const w = 92, h = 34;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.2)"; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
    ctx.fillStyle = "rgba(0,0,0,0.35)"; roundRect(x, y, w, h, 17); ctx.fill();
    ctx.restore();
    drawCoin(x + 18, y + h / 2, 11, animT * 4);
    plainText(String(value), x + 34, y + h / 2 + 1, 18, "#ffe680", "left", "bold");
  }

  function drawMenu() {
    // Titel mit Schatten
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
    text("FLAPPY", W / 2, 120, 58, "#ffe14d");
    text("BIRD", W / 2, 178, 58, "#ffe14d");
    ctx.restore();
    plainText("der Klassiker", W / 2, 218, 16, "rgba(255,255,255,0.9)", "center", "600");

    // Coins oben links, Zahnrad oben rechts
    coinBadge(12, 12, coins);
    drawGearButton(W - 50, 14);

    // Bestwert-Tafel
    const d = DIFFICULTIES[difficultyKey];
    const bw = 200, bx = (W - bw) / 2, by = 240, bh = 54;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.strokeStyle = "rgba(0,0,0,0.15)"; ctx.lineWidth = 2;
    roundRect(bx, by, bw, bh, 12); ctx.fill(); ctx.stroke();
    plainText("BESTWERT (" + d.name + ")", bx + bw / 2, by + 16, 12, "#9a8a5a", "center", "bold");
    plainText(String(getBest()), bx + bw / 2, by + 36, 24, "#5a3d00", "center", "bold");

    // Buttons
    button("▶  SPIELEN", W / 2 - 90, 320, 180, 56, () => startReady(), { pulse: true, fontSize: 24 });
    button("🛒  SHOP", W / 2 - 90, 392, 180, 48, () => { state = State.SHOP; shopScroll = 0; }, { bg: "#7ec8ff", border: "#3a8fd0", textColor: "#0a3a5a", fontSize: 20 });

    // Aktuelle Schwierigkeit als Chip
    plainText("Schwierigkeit:", W / 2 - 8, 462, 14, "rgba(255,255,255,0.95)", "right", "600");
    ctx.fillStyle = d.color; roundRect(W / 2 + 2, 452, 78, 20, 10); ctx.fill();
    plainText(d.name, W / 2 + 41, 463, 13, "#fff", "center", "bold");

    plainText("Leertaste / ↑ / W / Klick / Touch", W / 2, PLAY_BOTTOM + 55, 13, "rgba(255,255,255,0.9)");
  }

  function drawGearButton(x, y) {
    const r = 17, cx = x + r, cy = y + r;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.2)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // Zahnrad
    ctx.fillStyle = "#ffe680";
    const teeth = 8;
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const ang = (i / (teeth * 2)) * Math.PI * 2 + animT * 0.5;
      const rad = i % 2 === 0 ? 11 : 7.5;
      const xx = cx + Math.cos(ang) * rad, yy = cy + Math.sin(ang) * rad;
      i === 0 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fill();
    hitRegions.push({ x, y, w: r * 2, h: r * 2, action: () => { overlay = "settings"; } });
  }

  function drawSettings() {
    ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 0, W, H);
    hitRegions = []; // nur Overlay-Buttons aktiv
    const pw = 300, ph = 320, px = (W - pw) / 2, py = (H - ph) / 2;
    ctx.fillStyle = "#fff8e8"; ctx.strokeStyle = "#c98f1e"; ctx.lineWidth = 3;
    roundRect(px, py, pw, ph, 16); ctx.fill(); ctx.stroke();

    text("Einstellungen", W / 2, py + 36, 26, "#5a3d00");
    plainText("Schwierigkeit", W / 2, py + 70, 15, "#9a8a5a", "center", "bold");

    const keys = ["easy", "medium", "hard"];
    let yy = py + 92;
    for (const k of keys) {
      const d = DIFFICULTIES[k];
      const selected = k === difficultyKey;
      const bw = 250, bx = (W - bw) / 2, bh = 52;
      ctx.fillStyle = selected ? d.color : "#ece3cf";
      ctx.strokeStyle = selected ? "#3b3b3b" : "#c9bfa3"; ctx.lineWidth = selected ? 3 : 2;
      roundRect(bx, yy, bw, bh, 12); ctx.fill(); ctx.stroke();
      plainText(d.name, bx + 16, yy + 19, 19, selected ? "#fff" : "#5a3d00", "left", "bold");
      plainText(`×${d.scoreMult} Punkte · Tempo bis ${d.maxSpeed}`, bx + 16, yy + 38, 12, selected ? "rgba(255,255,255,0.9)" : "#8a7d5a", "left", "600");
      if (selected) { plainText("✓", bx + bw - 22, yy + bh / 2, 22, "#fff", "center", "bold"); }
      const kk = k;
      hitRegions.push({ x: bx, y: yy, w: bw, h: bh, action: () => { difficultyKey = kk; store.set("flappy-difficulty", kk); sfx.click(); } });
      yy += 62;
    }

    button("Schließen", W / 2 - 70, py + ph - 52, 140, 40, () => { overlay = null; }, { bg: "#ffce4a", fontSize: 18 });
  }

  // ---------- Shop ----------
  function drawShop() {
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(0, 0, W, H);
    text("SHOP", W / 2, 50, 38, "#ffe14d");
    coinBadge(W / 2 - 46, 78, coins);

    // Zurück-Button
    button("‹ Zurück", 12, 14, 92, 34, () => { state = State.MENU; }, { bg: "#ffce4a", fontSize: 16 });

    // Skin-Raster 2 Spalten
    const cols = 2, cardW = 168, cardH = 116, gapX = 14, gapY = 14;
    const totalW = cols * cardW + (cols - 1) * gapX;
    const startX = (W - totalW) / 2;
    const startY = 128;
    SKINS.forEach((skin, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = startX + col * (cardW + gapX);
      const y = startY + row * (cardH + gapY);
      drawSkinCard(skin, x, y, cardW, cardH);
    });
  }

  function drawSkinCard(skin, x, y, w, h) {
    const isOwned = owned.has(skin.id);
    const isSelected = currentSkin === skin.id;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
    ctx.fillStyle = "#fff8e8"; roundRect(x, y, w, h, 12); ctx.fill();
    ctx.restore();
    ctx.lineWidth = isSelected ? 4 : 2;
    ctx.strokeStyle = isSelected ? "#3ad17a" : "#d8cba8";
    roundRect(x, y, w, h, 12); ctx.stroke();

    // Vorschau
    drawBird(x + 42, y + 46, 0, 1, skin);
    plainText(skin.name, x + 80, y + 24, 16, "#5a3d00", "left", "bold");

    // Status / Aktion
    if (isSelected) {
      ctx.fillStyle = "#3ad17a"; roundRect(x + 72, y + h - 38, w - 84, 28, 8); ctx.fill();
      plainText("Ausgewählt", x + 72 + (w - 84) / 2, y + h - 24, 14, "#fff", "center", "bold");
    } else if (isOwned) {
      ctx.fillStyle = "#7ec8ff"; roundRect(x + 72, y + h - 38, w - 84, 28, 8); ctx.fill();
      plainText("Auswählen", x + 72 + (w - 84) / 2, y + h - 24, 14, "#0a3a5a", "center", "bold");
      hitRegions.push({ x: x + 72, y: y + h - 38, w: w - 84, h: 28, action: () => {
        currentSkin = skin.id; store.set("flappy-skin", skin.id); sfx.click();
      }});
    } else {
      const can = coins >= skin.price;
      ctx.fillStyle = can ? "#ffce4a" : "#cfc6b0";
      roundRect(x + 72, y + h - 38, w - 84, 28, 8); ctx.fill();
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      // Münz-Icon + Preis
      drawCoin(x + 86, y + h - 24, 9, animT * 4);
      plainText(String(skin.price), x + 100, y + h - 23, 15, can ? "#5a3d00" : "#8a8266", "left", "bold");
      hitRegions.push({ x: x + 72, y: y + h - 38, w: w - 84, h: 28, action: () => {
        if (coins >= skin.price) {
          coins -= skin.price; saveCoins();
          owned.add(skin.id); saveOwned();
          currentSkin = skin.id; store.set("flappy-skin", skin.id);
          sfx.buy(); toast = { text: skin.name + " freigeschaltet!", t: 1.8 };
        } else {
          sfx.deny(); toast = { text: "Nicht genug Coins", t: 1.5 };
        }
      }});
    }
  }

  function drawReady() {
    drawHud();
    text("Mach dich bereit!", W / 2, 150, 26, "#fff");
    const cx = W / 2, cy = 250;
    if (Math.sin(animT * 5) > -0.3) {
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx, cy + 18); ctx.lineTo(cx, cy - 18);
      ctx.moveTo(cx - 9, cy - 8); ctx.lineTo(cx, cy - 20); ctx.lineTo(cx + 9, cy - 8);
      ctx.stroke();
      plainText("Tippen zum Fliegen", W / 2, cy + 48, 16, "#fff", "center", "bold");
    }
  }

  function drawHud() {
    if (state === State.PLAYING || state === State.DYING || state === State.GAMEOVER || state === State.READY) {
      text(String(score), W / 2, 70, 46);
      // Coins dieser Runde oben rechts
      coinBadge(W - 104, 14, coinsThisRun);
    }
  }

  function drawGameOver() {
    if (gameOverTimer < 0.35) return;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
    text("Game Over", W / 2, 120, 42, "#ff6b4a");
    ctx.restore();

    const pw = 290, ph = 180, px = (W - pw) / 2;
    const slide = Math.max(0, 0.65 - gameOverTimer) * 220;
    const py = 165 + slide;

    ctx.fillStyle = "#f3e4b8"; ctx.strokeStyle = "#8a7340"; ctx.lineWidth = 3;
    roundRect(px, py, pw, ph, 14); ctx.fill(); ctx.stroke();

    // Medaille links
    const medal = medalFor(score);
    const mcx = px + 58, mcy = py + 70;
    ctx.beginPath(); ctx.arc(mcx, mcy, 36, 0, Math.PI * 2);
    if (medal) {
      const g = ctx.createRadialGradient(mcx - 8, mcy - 8, 4, mcx, mcy, 36);
      g.addColorStop(0, medal.light); g.addColorStop(1, medal.color);
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = medal.rim; ctx.lineWidth = 4; ctx.stroke();
      plainText(medal.name, mcx, mcy, 13, medal.rim, "center", "bold");
    } else {
      ctx.fillStyle = "#e7dcc0"; ctx.fill();
      ctx.strokeStyle = "#c2b48c"; ctx.lineWidth = 3; ctx.stroke();
      plainText("—", mcx, mcy, 24, "#b3a677", "center", "bold");
    }

    // Werte rechts
    const rx = px + pw - 24;
    plainText("PUNKTE", rx, py + 28, 13, "#b3552e", "right", "bold");
    plainText(String(score), rx, py + 50, 26, "#5a3d00", "right", "bold");
    plainText("BESTWERT", rx, py + 92, 13, "#b3552e", "right", "bold");
    plainText(String(getBest()), rx, py + 114, 26, "#5a3d00", "right", "bold");

    // Coins dieser Runde
    drawCoin(px + 110, py + 150, 10, animT * 4);
    plainText("+" + coinsThisRun + " Coins gesammelt", px + 124, py + 151, 14, "#7a5a1e", "left", "bold");

    // NEU!-Badge sauber oben rechts am Bestwert
    if (newBest) {
      ctx.save();
      ctx.translate(rx - 96, py + 92);
      ctx.rotate(-0.12);
      ctx.fillStyle = "#e84e3c";
      roundRect(-26, -11, 52, 22, 5); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; roundRect(-26, -11, 52, 22, 5); ctx.stroke();
      plainText("NEU!", 0, 1, 13, "#fff", "center", "bold");
      ctx.restore();
    }

    // Buttons
    if (gameOverTimer > 0.55) {
      const by = py + ph + 18;
      button("Nochmal", W / 2 - 150, by, 140, 46, () => startReady(), { pulse: true, fontSize: 20 });
      button("Menü", W / 2 + 10, by, 140, 46, () => { state = State.MENU; }, { bg: "#7ec8ff", border: "#3a8fd0", textColor: "#0a3a5a", fontSize: 20 });
    }
  }

  function medalFor(s) {
    if (s >= 40) return { name: "PLATIN", color: "#cfd8dc", light: "#ffffff", rim: "#8fa0a8" };
    if (s >= 30) return { name: "GOLD",   color: "#ffd233", light: "#fff2a0", rim: "#b8860b" };
    if (s >= 20) return { name: "SILBER", color: "#c4cace", light: "#f0f3f5", rim: "#8b9296" };
    if (s >= 10) return { name: "BRONZE", color: "#cd7f32", light: "#e8a86a", rim: "#8c5a20" };
    return null;
  }

  function drawToast() {
    const a = Math.min(1, toast.t * 2);
    const w = 240, h = 40, x = (W - w) / 2, y = H - 140;
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(0,0,0,0.8)"; roundRect(x, y, w, h, 10); ctx.fill();
    plainText(toast.text, W / 2, y + h / 2 + 1, 16, "#ffe680", "center", "bold");
    ctx.globalAlpha = 1;
  }

  // ============================================================
  //  Hauptschleife
  // ============================================================
  function loop(time) {
    const dt = Math.min((time - lastTime) / 1000, 1 / 30);
    lastTime = time;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame((t) => { lastTime = t; requestAnimationFrame(loop); });
})();
