/* ============================================================
   Flappy Bird – vollständiger Klon (reines JavaScript)
   ============================================================ */
(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx    = canvas.getContext("2d");
  const W = canvas.width;   // 400
  const H = canvas.height;  // 600

  // ── Konstanten ───────────────────────────────────────────────
  const GROUND_H   = 90;
  const PLAY_BOTTOM = H - GROUND_H;   // 510
  const GRAVITY     = 1500;
  const FLAP_VEL    = -420;
  const MAX_FALL    = 750;
  const PIPE_W      = 70;
  const PIPE_SPACE  = 220;
  const BIRD_X      = 110;
  const BIRD_R      = 14;
  const COIN_R      = 12;

  // Shop-Layout-Konstanten (einmalig berechnet)
  const SH_HDR  = 110;                       // feste Header-Höhe
  const SH_CW   = 166;                       // Karten-Breite
  const SH_CH   = 120;                       // Karten-Höhe
  const SH_GX   = 14;                        // horizontaler Karten-Abstand
  const SH_GY   = 12;                        // vertikaler Karten-Abstand
  const SH_SX   = (W - (2 * SH_CW + SH_GX)) / 2;  // 27
  const SH_SY   = SH_HDR + 8;               // 118 – Inhaltsbeginn Y

  // ── Schwierigkeitsstufen ──────────────────────────────────────
  const DIFF = {
    easy:   { key:"easy",   name:"Einfach", color:"#3ad17a", gap:180, base:125, max:190, acc:2.5, mult:1 },
    medium: { key:"medium", name:"Mittel",  color:"#ffb03a", gap:150, base:150, max:265, acc:4.0, mult:2 },
    hard:   { key:"hard",   name:"Schwer",  color:"#ff5a5a", gap:128, base:175, max:350, acc:5.5, mult:3 },
  };

  // ── Skins ────────────────────────────────────────────────────
  const SKINS = [
    { id:"classic", name:"Klassik",   price:  0, body:"#f8d147", belly:"#fdf2cd", wing:"#e6b020", beak:"#f3722c" },
    { id:"red",     name:"Rubin",     price: 15, body:"#ff5252", belly:"#ffd2d2", wing:"#c72020", beak:"#ffb03a" },
    { id:"blue",    name:"Saphir",    price: 30, body:"#4aa3ff", belly:"#d2e8ff", wing:"#1a6dcc", beak:"#ffb03a" },
    { id:"green",   name:"Smaragd",   price: 50, body:"#3ad17a", belly:"#cdf5dd", wing:"#1a9050", beak:"#ff9a3a" },
    { id:"purple",  name:"Amethyst",  price: 90, body:"#b06aff", belly:"#e7d2ff", wing:"#7030cc", beak:"#ffb03a" },
    { id:"pink",    name:"Flamingo",  price:140, body:"#ff7ac4", belly:"#ffd6ee", wing:"#cc3090", beak:"#ffb03a" },
    { id:"gold",    name:"Gold",      price:250, body:"#ffd700", belly:"#fff3b0", wing:"#c8a400", beak:"#d07000", shine:true, eyeColor:"#c8a000" },
    { id:"shadow",  name:"Schatten",  price:400, body:"#2e3340", belly:"#464c60", wing:"#181c24", beak:"#ff4040", shine:true, eyeColor:"#ff2020", angry:true },
  ];

  // ── Persistenz ────────────────────────────────────────────────
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, String(v)); } catch {} },
  };
  let coins   = parseInt(store.get("fb-coins", "0"), 10) || 0;
  let owned   = new Set((store.get("fb-owned", "classic") || "classic").split(",").filter(Boolean));
  owned.add("classic");
  let curSkin = store.get("fb-skin", "classic");
  if (!SKINS.some(s => s.id === curSkin)) curSkin = "classic";
  let diffKey = store.get("fb-diff", "medium");
  if (!DIFF[diffKey]) diffKey = "medium";
  const bestKey = () => "fb-best-" + diffKey;
  const getBest = () => parseInt(store.get(bestKey(), "0"), 10) || 0;
  const saveCoins = () => store.set("fb-coins", coins);
  const saveOwned = () => store.set("fb-owned", [...owned].join(","));
  const skinById  = id => SKINS.find(s => s.id === id) || SKINS[0];

  // ── Zustände ──────────────────────────────────────────────────
  const S = { MENU:0, SHOP:1, READY:2, PLAYING:3, DYING:4, GAMEOVER:5 };
  let state   = S.MENU;
  let overlay = null;   // null | "settings"

  // ── Spielvariablen ────────────────────────────────────────────
  let bird, pipes, coinEnts, score, pipesPassed, speed, coinsRun;
  let groundX = 0, bgX = 0, cloudX = 0;
  let lastTime = 0, animT = 0;
  let flashAlpha = 0, gameOverTimer = 0;
  let newBest = false;
  let toast = null;          // { text, t }
  let particles = [];
  let shopScroll = 0;

  // Drag-State für Shop-Scrollen
  let drag = null;  // { startY, scrollStart, moved }

  // Hit-Regions (jeden Frame neu aufgebaut, nur für Nicht-Shop-Screens)
  let hitRegions = [];

  // ── Sound ─────────────────────────────────────────────────────
  let audioCtx = null;
  function snd(freq, dur, type = "square", vol = 0.15, slide = 0) {
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
    } catch {}
  }
  const sfx = {
    flap:  () => snd(500,0.08,"square",0.08,200),
    score: () => { snd(880,0.07,"square",0.1); setTimeout(()=>snd(1320,0.09,"square",0.1),70); },
    coin:  () => { snd(1180,0.06,"sine",0.12); setTimeout(()=>snd(1760,0.1,"sine",0.12),55); },
    hit:   () => snd(200,0.25,"sawtooth",0.18,-150),
    die:   () => snd(400,0.4,"sawtooth",0.12,-350),
    click: () => snd(660,0.06,"square",0.08),
    buy:   () => { snd(740,0.08,"triangle",0.12); setTimeout(()=>snd(990,0.08,"triangle",0.12),80); setTimeout(()=>snd(1320,0.12,"triangle",0.12),160); },
    deny:  () => snd(160,0.18,"sawtooth",0.14,-40),
  };

  // ============================================================
  //  Eingabe
  // ============================================================
  function getPos(e) {
    const r = canvas.getBoundingClientRect();
    const s = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
    return { x: (s.clientX - r.left) * (W / r.width), y: (s.clientY - r.top) * (H / r.height) };
  }

  function onDown(e) {
    e.preventDefault();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();

    if (state === S.PLAYING)              { flap(); return; }
    if (state === S.READY)                { state = S.PLAYING; flap(); return; }
    if (state === S.DYING)                return;

    const p = getPos(e);

    // Shop: Drag starten, Klick erst beim Loslassen auswerten
    if (state === S.SHOP) {
      drag = { startY: p.y, scrollStart: shopScroll, moved: false };
      return;
    }

    // Overlay oder normale Screens: Hit-Regions prüfen (rückwärts = oberste zuerst)
    for (let i = hitRegions.length - 1; i >= 0; i--) {
      const r = hitRegions[i];
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
        sfx.click(); r.action(); return;
      }
    }
  }

  function onMove(e) {
    if (!drag) return;
    e.preventDefault();
    const p = getPos(e);
    const dy = p.y - drag.startY;
    if (Math.abs(dy) > 5) drag.moved = true;
    shopScroll = Math.max(0, Math.min(shopMaxScroll(), drag.scrollStart - dy));
  }

  function onUp(e) {
    if (!drag) return;
    const p = getPos(e);
    if (!drag.moved) handleShopTap(p.x, p.y);
    drag = null;
  }

  canvas.addEventListener("mousedown",  onDown);
  canvas.addEventListener("mousemove",  onMove);
  canvas.addEventListener("mouseup",    onUp);
  canvas.addEventListener("touchstart", onDown, { passive: false });
  canvas.addEventListener("touchmove",  onMove, { passive: false });
  canvas.addEventListener("touchend",   onUp);

  document.addEventListener("keydown", e => {
    const code = e.code;
    if (code === "Space" || code === "ArrowUp" || code === "KeyW") {
      e.preventDefault(); if (e.repeat) return;
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
      if      (state === S.MENU     && !overlay) startReady();
      else if (state === S.READY)               { state = S.PLAYING; flap(); }
      else if (state === S.PLAYING)             flap();
      else if (state === S.GAMEOVER && gameOverTimer > 0.7) startReady();
    } else if (code === "Escape") {
      if (overlay)         overlay = null;
      else if (state===S.SHOP) { state = S.MENU; shopScroll = 0; }
    }
  });

  // ── Shop-Klick-Logik (separiert von hitRegions) ──────────────
  function shopMaxScroll() {
    const rows = Math.ceil(SKINS.length / 2);
    const bottom = SH_SY + rows * (SH_CH + SH_GY) - SH_GY + 28;
    return Math.max(0, bottom - H);
  }

  function handleShopTap(cx, cy) {
    // Zurück-Button (fester Header)
    if (cx >= 10 && cx <= 98 && cy >= 10 && cy <= 42) {
      state = S.MENU; shopScroll = 0; sfx.click(); return;
    }
    if (cy < SH_HDR) return;     // Header, aber kein Button getroffen
    const contentY = cy + shopScroll;

    for (let i = 0; i < SKINS.length; i++) {
      const col = i % 2, row = Math.floor(i / 2);
      const cx0 = SH_SX + col * (SH_CW + SH_GX);
      const cy0 = SH_SY + row * (SH_CH + SH_GY);
      // Aktions-Button im unteren Teil der Karte
      const bx = cx0 + 68, by = cy0 + SH_CH - 36, bw = SH_CW - 78, bh = 26;
      if (cx >= bx && cx <= bx + bw && contentY >= by && contentY <= by + bh) {
        const sk = SKINS[i];
        if (owned.has(sk.id)) {
          if (curSkin !== sk.id) { curSkin = sk.id; store.set("fb-skin", sk.id); sfx.click(); }
        } else if (coins >= sk.price) {
          coins -= sk.price; saveCoins();
          owned.add(sk.id); saveOwned();
          curSkin = sk.id; store.set("fb-skin", sk.id);
          sfx.buy(); toast = { text: sk.name + " freigeschaltet! 🎉", t: 1.8 };
        } else {
          sfx.deny(); toast = { text: "Zu wenig Coins (brauche " + sk.price + ")", t: 1.5 };
        }
        return;
      }
    }
  }

  // ============================================================
  //  Spielablauf
  // ============================================================
  function startReady() {
    state = S.READY;
    bird = { y: H/2 - 20, vy: 0, rot: 0, wingFrame: 0, wingTimer: 0 };
    pipes = []; coinEnts = []; particles = [];
    score = 0; pipesPassed = 0; coinsRun = 0;
    speed = DIFF[diffKey].base;
    flashAlpha = 0; gameOverTimer = 0; newBest = false;
  }

  function spawnPipe(x) {
    const d = DIFF[diffKey], margin = 55;
    const minY = margin + d.gap / 2, maxY = PLAY_BOTTOM - margin - d.gap / 2;
    const gapY = minY + Math.random() * (maxY - minY);
    pipes.push({ x, gapY, scored: false });
    if (Math.random() < 0.65) coinEnts.push({ x: x + PIPE_SPACE / 2, y: gapY + (Math.random() - 0.5) * 40, phase: Math.random() * 6, col: false });
  }

  function flap() { bird.vy = FLAP_VEL; bird.rot = -0.45; sfx.flap(); }

  function die() {
    if (state !== S.PLAYING) return;
    state = S.DYING; flashAlpha = 1;
    sfx.hit(); setTimeout(() => sfx.die(), 150);
    if (score > getBest()) { store.set(bestKey(), score); newBest = true; }
    coins += coinsRun; saveCoins();
  }

  // ============================================================
  //  Update
  // ============================================================
  function update(dt) {
    animT += dt;
    if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }

    // Flügelschlag
    bird.wingTimer += dt;
    if (bird.wingTimer > 0.1) { bird.wingTimer = 0; bird.wingFrame = (bird.wingFrame + 1) % 3; }

    // Hintergrund-Scroll
    const sc = (state === S.DYING || state === S.GAMEOVER) ? 0 : (state === S.PLAYING ? speed : 60);
    groundX = (groundX - sc * dt) % 24;
    bgX     = (bgX     - sc * 0.2  * dt) % W;
    cloudX  = (cloudX  - sc * 0.35 * dt) % W;

    // Partikel
    for (const pt of particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; }
    particles = particles.filter(pt => pt.life > 0);

    // Vogel im Ruhezustand schwebt
    if (state === S.MENU || state === S.SHOP || state === S.READY) {
      bird.y   = (state === S.READY ? H/2 - 20 : H/2 - 40) + Math.sin(animT * 3) * 9;
      bird.rot = Math.sin(animT * 3) * 0.12;
      return;
    }

    // Physik
    if (state === S.PLAYING || state === S.DYING) {
      bird.vy = Math.min(bird.vy + GRAVITY * dt, MAX_FALL);
      bird.y += bird.vy * dt;
      const target = bird.vy < 0 ? -0.45 : Math.min(1.4, bird.vy / 350);
      bird.rot += (target - bird.rot) * Math.min(1, dt * 12);
      if (bird.y < BIRD_R)              { bird.y = BIRD_R; bird.vy = 0; }
      if (bird.y > PLAY_BOTTOM - BIRD_R) { bird.y = PLAY_BOTTOM - BIRD_R; bird.vy = 0; die(); state = S.GAMEOVER; }
    }

    if (state === S.PLAYING) {
      const d = DIFF[diffKey];
      speed = Math.min(d.max, d.base + pipesPassed * d.acc);

      for (const p of pipes) p.x  -= speed * dt;
      for (const c of coinEnts) { c.x -= speed * dt; c.phase += dt * 5; }

      if (!pipes.length) spawnPipe(W + 60);
      else if (pipes[pipes.length - 1].x < W - PIPE_SPACE) spawnPipe(pipes[pipes.length - 1].x + PIPE_SPACE);

      pipes    = pipes.filter(p => p.x > -PIPE_W);
      coinEnts = coinEnts.filter(c => c.x > -40 && !c.col);

      for (const p of pipes) {
        if (!p.scored && p.x + PIPE_W < BIRD_X) { p.scored = true; pipesPassed++; score += d.mult; sfx.score(); }
        if (hitPipe(p)) die();
      }

      for (const c of coinEnts) {
        const dx = c.x - BIRD_X, dy = c.y - bird.y;
        if (!c.col && dx*dx + dy*dy < (BIRD_R + COIN_R) * (BIRD_R + COIN_R)) {
          c.col = true; coinsRun++; sfx.coin();
          for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2, sp = 70 + Math.random() * 90;
            particles.push({ x: c.x, y: c.y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp, life: 0.55, max: 0.55 });
          }
        }
      }
    }

    if (state === S.DYING || state === S.GAMEOVER) {
      gameOverTimer += dt;
      flashAlpha = Math.max(0, flashAlpha - dt * 3);
    }
  }

  function hitPipe(p) {
    const g = DIFF[diffKey].gap;
    const top = { x:p.x, y:0,             w:PIPE_W, h:p.gapY - g/2 };
    const bot = { x:p.x, y:p.gapY + g/2,  w:PIPE_W, h:PLAY_BOTTOM - (p.gapY + g/2) };
    return cRect(BIRD_X, bird.y, BIRD_R, top) || cRect(BIRD_X, bird.y, BIRD_R, bot);
  }
  function cRect(cx, cy, r, rect) {
    const nx = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
    const ny = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
    return (cx-nx)*(cx-nx) + (cy-ny)*(cy-ny) < r*r;
  }

  // ============================================================
  //  Zeichnen – Helferfunktionen
  // ============================================================
  function txt(t, x, y, sz, fill="#fff", align="center", weight="bold") {
    ctx.font = `${weight} ${sz}px "Segoe UI",Arial,sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(3, sz/8); ctx.lineJoin = "round";
    ctx.strokeStyle = "#2a2218"; ctx.strokeText(t, x, y);
    ctx.fillStyle = fill; ctx.fillText(t, x, y);
  }
  function ptxt(t, x, y, sz, fill, align="center", weight="normal") {
    ctx.font = `${weight} ${sz}px "Segoe UI",Arial,sans-serif`;
    ctx.textAlign = align; ctx.textBaseline = "middle";
    ctx.fillStyle = fill; ctx.fillText(t, x, y);
  }
  function rRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r); ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);     ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
  }
  function btn(label, x, y, w, h, action, o={}) {
    const bg=o.bg||"#ffce4a", bd=o.border||"#c98f1e", tc=o.tc||"#5a3d00";
    const pulse = o.pulse ? 1 + Math.sin(animT*5)*0.025 : 1;
    const dw=w*pulse, dh=h*pulse, dx=x-(dw-w)/2, dy=y-(dh-h)/2;
    ctx.save();
    ctx.shadowColor="rgba(0,0,0,0.28)"; ctx.shadowBlur=8; ctx.shadowOffsetY=3;
    ctx.fillStyle=bg; rRect(dx,dy,dw,dh,o.r!=null?o.r:12); ctx.fill();
    ctx.restore();
    ctx.strokeStyle=bd; ctx.lineWidth=3; rRect(dx,dy,dw,dh,o.r!=null?o.r:12); ctx.stroke();
    if (label) {
      ctx.font=`bold ${o.fs||22}px "Segoe UI",Arial,sans-serif`;
      ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.fillStyle=tc; ctx.fillText(label, x+w/2, y+h/2+1);
    }
    if (action) hitRegions.push({x,y,w,h,action});
  }
  function coinBadge(x, y, val) {
    const w=96, h=34;
    ctx.save();
    ctx.shadowColor="rgba(0,0,0,0.2)"; ctx.shadowBlur=5; ctx.shadowOffsetY=2;
    ctx.fillStyle="rgba(0,0,0,0.38)"; rRect(x,y,w,h,17); ctx.fill();
    ctx.restore();
    drawCoin(x+18, y+h/2, 11, animT*4);
    ptxt(String(val), x+36, y+h/2+1, 18, "#ffe680", "left", "bold");
  }

  // ── Vogel ────────────────────────────────────────────────────
  function drawBird(px, py, rot, wf, skin) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    const ol = "#3e2e0e";

    // ── Schwanz ──
    ctx.fillStyle = skin.wing; ctx.strokeStyle = ol; ctx.lineWidth = 1.5;
    ctx.beginPath(); // obere Schwanzfeder
    ctx.moveTo(-15,-2); ctx.lineTo(-29,-11); ctx.lineTo(-24,-1); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); // untere Schwanzfeder
    ctx.moveTo(-15,4); ctx.lineTo(-29,11); ctx.lineTo(-24,3); ctx.closePath();
    ctx.fill(); ctx.stroke();

    // ── Flügel (3 Phasen: oben / mitte / unten) ──
    const wingRot = [-0.7, 0, 0.7][wf];
    ctx.save();
    ctx.translate(-8, 0);
    ctx.rotate(wingRot);
    ctx.fillStyle = skin.wing; ctx.strokeStyle = ol; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(-5, 0, 14, 6.5, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    // Flügel-Glanz
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath(); ctx.ellipse(-5, -1.5, 8, 3, 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // ── Körper ──
    ctx.fillStyle = skin.body; ctx.strokeStyle = ol; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(0, 0, 20, 16, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();

    // Körper-Glanz (oben links)
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath(); ctx.ellipse(-5, -5, 10, 6, -0.4, 0, Math.PI*2); ctx.fill();

    // Sonderer Glanz bei Shine-Skins
    if (skin.shine) {
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath(); ctx.ellipse(4, 4, 14, 10, 0.3, 0, Math.PI*2); ctx.fill();
    }

    // ── Bauch ──
    ctx.fillStyle = skin.belly;
    ctx.beginPath(); ctx.ellipse(2, 8, 13, 8, 0.15, 0, Math.PI*2); ctx.fill();

    // ── Auge ──
    // Lederhaut (Augenweiß)
    ctx.fillStyle = "#fff"; ctx.strokeStyle = ol; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(9, -4, 7.5, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    // Iris
    const irisColor = skin.eyeColor || "#42b0ff";
    ctx.fillStyle = irisColor;
    ctx.beginPath(); ctx.arc(9.5, -4, 5, 0, Math.PI*2); ctx.fill();
    // Pupille
    ctx.fillStyle = "#111118";
    ctx.beginPath(); ctx.arc(9.5, -4, 3, 0, Math.PI*2); ctx.fill();
    // Hauptglanz
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(11.2, -5.5, 1.7, 0, Math.PI*2); ctx.fill();
    // Kleiner zweiter Glanzpunkt
    ctx.beginPath(); ctx.arc(8.5, -2.5, 0.8, 0, Math.PI*2); ctx.fill();

    // Augenbraue (bei Shadow-Skin wütend, sonst freundlich)
    ctx.strokeStyle = ol; ctx.lineWidth = 2.5; ctx.lineCap = "round";
    if (skin.angry) {
      ctx.beginPath(); ctx.moveTo(3,-10); ctx.quadraticCurveTo(9,-8,17,-12); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(3,-10); ctx.quadraticCurveTo(9,-13,17,-10); ctx.stroke();
    }

    // ── Schnabel (oben + unten) ──
    ctx.strokeStyle = ol; ctx.lineWidth = 1.8;
    // Oberschnabel
    ctx.fillStyle = skin.beak;
    ctx.beginPath(); ctx.moveTo(13,-3); ctx.lineTo(28,0); ctx.lineTo(13,3); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // Unterschnabel (etwas dunkler per Alpha)
    ctx.save(); ctx.globalAlpha = 0.78;
    ctx.beginPath(); ctx.moveTo(13,3); ctx.lineTo(25,5); ctx.lineTo(13,8); ctx.closePath();
    ctx.fill(); ctx.restore(); ctx.stroke();
    // Schnabellinie
    ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(13,3); ctx.lineTo(26,3); ctx.stroke();
    // Nasenloch
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath(); ctx.arc(19,-1.5,1.5,0,Math.PI*2); ctx.fill();

    ctx.restore();
  }

  // ── Hintergrund ──────────────────────────────────────────────
  function drawBg() {
    const sky = ctx.createLinearGradient(0,0,0,H);
    sky.addColorStop(0,"#4ec0ca"); sky.addColorStop(0.7,"#7fdde6"); sky.addColorStop(1,"#aeeef2");
    ctx.fillStyle = sky; ctx.fillRect(0,0,W,H);
    for (let o=0;o<2;o++) {
      const x0 = cloudX + o*W;
      ctx.fillStyle="rgba(255,255,255,0.85)";
      drawCloud(x0+50,110,1); drawCloud(x0+210,70,0.7); drawCloud(x0+330,150,0.85);
    }
    const cy = PLAY_BOTTOM;
    for (let o=0;o<2;o++) {
      const x0 = bgX + o*W;
      ctx.fillStyle="#c8f0d8";
      [[10,60,36],[55,90,30],[95,50,40],[145,75,28],[180,55,45],[235,95,26],[270,65,38],[318,80,32],[358,50,40]].forEach(([bx,bh,bw])=>ctx.fillRect(x0+bx,cy-bh,bw,bh));
      ctx.fillStyle="#9ce3b0";
      for (let i=0;i<10;i++){ctx.beginPath();ctx.arc(x0+i*42+8,cy,16,Math.PI,0);ctx.fill();}
    }
  }
  function drawCloud(x,y,s){ctx.beginPath();ctx.arc(x,y,18*s,0,Math.PI*2);ctx.arc(x+20*s,y-8*s,14*s,0,Math.PI*2);ctx.arc(x+40*s,y,16*s,0,Math.PI*2);ctx.arc(x+20*s,y+6*s,15*s,0,Math.PI*2);ctx.fill();}

  function drawPipes() {
    const g = DIFF[diffKey].gap;
    for (const p of pipes) {
      drawPipe(p.x, 0, p.gapY - g/2, true);
      drawPipe(p.x, p.gapY + g/2, PLAY_BOTTOM - (p.gapY + g/2), false);
    }
  }
  function drawPipe(x,y,h,top) {
    if (h<=0) return;
    const ch=26, cs=4;
    const body=ctx.createLinearGradient(x,0,x+PIPE_W,0);
    body.addColorStop(0,"#578a2a");body.addColorStop(0.15,"#9ade49");body.addColorStop(0.45,"#c7f06e");body.addColorStop(0.7,"#74b834");body.addColorStop(1,"#46701f");
    ctx.fillStyle=body; ctx.fillRect(x,y,PIPE_W,h);
    ctx.strokeStyle="#2e4d14"; ctx.lineWidth=2; ctx.strokeRect(x+1,y-2,PIPE_W-2,h+4);
    const capY = top ? y+h-ch : y;
    const cap=ctx.createLinearGradient(x-cs,0,x+PIPE_W+cs,0);
    cap.addColorStop(0,"#578a2a");cap.addColorStop(0.15,"#a8e85a");cap.addColorStop(0.45,"#d2f47e");cap.addColorStop(0.7,"#7cc23a");cap.addColorStop(1,"#46701f");
    ctx.fillStyle=cap; ctx.fillRect(x-cs,capY,PIPE_W+cs*2,ch);
    ctx.strokeRect(x-cs+1,capY+1,PIPE_W+cs*2-2,ch-2);
  }

  function drawCoins() { for (const c of coinEnts) if(!c.col) drawCoin(c.x, c.y+Math.sin(c.phase)*4, COIN_R, c.phase); }
  function drawCoin(x,y,r,phase) {
    const sx=Math.max(0.12,Math.abs(Math.cos(phase)));
    ctx.save(); ctx.translate(x,y); ctx.scale(sx,1);
    const g=ctx.createLinearGradient(0,-r,0,r);
    g.addColorStop(0,"#ffe680"); g.addColorStop(0.5,"#ffcc33"); g.addColorStop(1,"#e0a818");
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle="#b9860b"; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle="#fff2b0"; ctx.font=`bold ${r}px Arial`; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("★",0,1);
    ctx.restore();
  }
  function drawParticles() {
    for (const pt of particles) {
      ctx.globalAlpha = Math.max(0, pt.life/pt.max);
      ctx.fillStyle="#ffd84a"; ctx.beginPath(); ctx.arc(pt.x,pt.y,3,0,Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function drawGround() {
    const gy=PLAY_BOTTOM;
    ctx.fillStyle="#ded895"; ctx.fillRect(0,gy,W,GROUND_H);
    ctx.fillStyle="#73bf2e"; ctx.fillRect(0,gy,W,14);
    ctx.fillStyle="#9be060";
    for (let x=groundX-24;x<W+24;x+=24){ctx.beginPath();ctx.moveTo(x,gy+14);ctx.lineTo(x+12,gy);ctx.lineTo(x+24,gy+14);ctx.closePath();ctx.fill();}
    ctx.fillStyle="#5a9e22"; ctx.fillRect(0,gy+14,W,3);
    ctx.fillStyle="#cbc27c";
    for (let x=groundX-24;x<W+24;x+=24) for(let row=0;row<3;row++) ctx.fillRect(x+(row%2)*12,gy+30+row*18,8,8);
  }

  // ============================================================
  //  Screens
  // ============================================================
  function drawMenu() {
    ctx.save();
    ctx.shadowColor="rgba(0,0,0,0.35)"; ctx.shadowBlur=10; ctx.shadowOffsetY=4;
    txt("FLAPPY", W/2, 115, 60, "#ffe14d");
    txt("BIRD",   W/2, 175, 60, "#ffe14d");
    ctx.restore();
    ptxt("der Klassiker", W/2, 215, 16, "rgba(255,255,255,0.92)", "center", "600");

    coinBadge(12, 12, coins);
    drawGear(W-50, 14);

    // Vogel groß in der Mitte anzeigen
    drawBird(W/2, bird.y, bird.rot, bird.wingFrame, skinById(curSkin));

    // Bestwert-Tafel
    const d=DIFF[diffKey], bw=210, bx=(W-bw)/2, by=255, bh=56;
    ctx.fillStyle="rgba(255,255,255,0.92)"; ctx.strokeStyle="rgba(0,0,0,0.12)"; ctx.lineWidth=2;
    rRect(bx,by,bw,bh,13); ctx.fill(); ctx.stroke();
    ptxt("BESTWERT  ·  "+d.name, bx+bw/2, by+17, 12, "#9a8a5a", "center","bold");
    ptxt(String(getBest()), bx+bw/2, by+38, 26, "#5a3d00", "center","bold");

    btn("▶  SPIELEN", W/2-92,330,184,56, ()=>startReady(), {pulse:true,fs:24});
    btn("🛒  SHOP",   W/2-92,403,184,48, ()=>{state=S.SHOP;shopScroll=0;}, {bg:"#7ec8ff",border:"#3a8fd0",tc:"#0a3a5a",fs:20});

    ptxt("Schwierigkeit:", W/2-10,470,14,"rgba(255,255,255,0.95)","right","600");
    ctx.fillStyle=d.color; rRect(W/2+2,460,80,20,10); ctx.fill();
    ptxt(d.name, W/2+42,471,13,"#fff","center","bold");

    ptxt("Leertaste / ↑ / W / Klick / Touch", W/2,PLAY_BOTTOM+55,13,"rgba(255,255,255,0.9)");
  }

  function drawGear(x,y) {
    const r=17, cx=x+r, cy=y+r;
    ctx.save();
    ctx.shadowColor="rgba(0,0,0,0.2)"; ctx.shadowBlur=4; ctx.shadowOffsetY=2;
    ctx.fillStyle="rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.fillStyle="#ffe680";
    ctx.beginPath();
    for (let i=0;i<16;i++) {
      const a=(i/16)*Math.PI*2+animT*0.5, rad=i%2===0?12:8;
      const xx=cx+Math.cos(a)*rad, yy=cy+Math.sin(a)*rad;
      i===0?ctx.moveTo(xx,yy):ctx.lineTo(xx,yy);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle="rgba(0,0,0,0.42)"; ctx.beginPath(); ctx.arc(cx,cy,4,0,Math.PI*2); ctx.fill();
    hitRegions.push({x,y,w:r*2,h:r*2,action:()=>{overlay="settings";}});
  }

  function drawSettings() {
    ctx.fillStyle="rgba(0,0,0,0.58)"; ctx.fillRect(0,0,W,H);
    hitRegions = []; // nur Overlay-Buttons aktiv
    const pw=305, ph=328, px=(W-pw)/2, py=(H-ph)/2;
    ctx.fillStyle="#fff8e8"; ctx.strokeStyle="#c98f1e"; ctx.lineWidth=3;
    rRect(px,py,pw,ph,16); ctx.fill(); ctx.stroke();
    txt("Einstellungen", W/2, py+36, 26, "#5a3d00");
    ptxt("Schwierigkeit wählen", W/2, py+68, 14, "#9a8a5a","center","bold");

    let yy = py+90;
    for (const k of ["easy","medium","hard"]) {
      const d=DIFF[k], sel=k===diffKey;
      const bw=256, bx=(W-bw)/2, bh=54;
      ctx.fillStyle=sel?d.color:"#ece3cf"; ctx.strokeStyle=sel?"#3a3a3a":"#c9bfa3"; ctx.lineWidth=sel?3:2;
      rRect(bx,yy,bw,bh,12); ctx.fill(); ctx.stroke();
      ptxt(d.name, bx+18, yy+20, 20, sel?"#fff":"#5a3d00","left","bold");
      ptxt(`×${d.mult} Punkte / Röhre  ·  Tempo bis ${d.max}`, bx+18, yy+39, 12, sel?"rgba(255,255,255,0.9)":"#8a7d5a","left","600");
      if (sel) ptxt("✓", bx+bw-22, yy+bh/2, 22,"#fff","center","bold");
      const kk=k;
      hitRegions.push({x:bx,y:yy,w:bw,h:bh,action:()=>{diffKey=kk;store.set("fb-diff",kk);sfx.click();}});
      yy += 64;
    }
    btn("Schließen", W/2-70, py+ph-52, 140,40, ()=>{overlay=null;},{bg:"#ffce4a",fs:18});
  }

  // ── Shop ─────────────────────────────────────────────────────
  function drawShop() {
    // Dunkle Overlay-Schicht über dem Spielhintergrund
    ctx.fillStyle="rgba(8,16,28,0.78)"; ctx.fillRect(0,0,W,H);

    // Fester Header
    ctx.fillStyle="rgba(0,0,0,0.45)"; ctx.fillRect(0,0,W,SH_HDR);
    ctx.strokeStyle="rgba(255,200,80,0.3)"; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,SH_HDR); ctx.lineTo(W,SH_HDR); ctx.stroke();

    ctx.save();
    ctx.shadowColor="#ffd84a"; ctx.shadowBlur=14;
    txt("SKIN SHOP", W/2, 34, 30, "#ffe14d");
    ctx.restore();
    coinBadge(W/2-48, 62, coins);

    // Zurück-Button (nur visuell; Klick via handleShopTap)
    ctx.save();
    ctx.shadowColor="rgba(0,0,0,0.25)"; ctx.shadowBlur=6; ctx.shadowOffsetY=2;
    ctx.fillStyle="#ffce4a"; rRect(10,10,88,32,8); ctx.fill();
    ctx.restore();
    ctx.strokeStyle="#c98f1e"; ctx.lineWidth=2; rRect(10,10,88,32,8); ctx.stroke();
    ptxt("‹ Zurück", 54,26,14,"#5a3d00","center","bold");

    // Scrollbarer Karten-Bereich mit Clipping
    ctx.save();
    ctx.beginPath(); ctx.rect(0,SH_HDR,W,H-SH_HDR); ctx.clip();
    ctx.translate(0,-shopScroll);

    for (let i=0;i<SKINS.length;i++) {
      const col=i%2, row=Math.floor(i/2);
      const x=SH_SX+col*(SH_CW+SH_GX);
      const y=SH_SY+row*(SH_CH+SH_GY);
      drawSkinCard(SKINS[i],x,y);
    }

    ctx.restore();

    // Scrollbar
    const maxSc=shopMaxScroll();
    if (maxSc>0) {
      const scrollH=H-SH_HDR, barH=Math.max(30,scrollH*scrollH/(scrollH+maxSc));
      const barY=SH_HDR+(shopScroll/maxSc)*(scrollH-barH);
      ctx.fillStyle="rgba(255,255,255,0.22)"; rRect(W-9,barY,6,barH,3); ctx.fill();
    }
    // Scroll-Pfeil wenn noch Inhalt unten
    if (maxSc>0 && shopScroll<maxSc-2) {
      ctx.globalAlpha=0.5+0.4*Math.sin(animT*4);
      ptxt("▼", W/2, H-14, 16,"#fff");
      ctx.globalAlpha=1;
    }
  }

  function drawSkinCard(skin, x, y) {
    const isOwn=owned.has(skin.id), isSel=curSkin===skin.id, canBuy=coins>=skin.price;
    const w=SH_CW, h=SH_CH;

    ctx.save();
    ctx.shadowColor="rgba(0,0,0,0.4)"; ctx.shadowBlur=10; ctx.shadowOffsetY=4;
    ctx.fillStyle=isSel?"#1b3828":(isOwn?"#202438":"#181c2e");
    rRect(x,y,w,h,12); ctx.fill();
    ctx.restore();
    ctx.strokeStyle=isSel?"#3ad17a":(isOwn?"#4a5080":"#283050"); ctx.lineWidth=isSel?3:1.5;
    rRect(x,y,w,h,12); ctx.stroke();

    // Vogel-Vorschau (links)
    drawBird(x+38, y+h/2-4, 0, 1, skin);

    // Name rechts
    ptxt(skin.name, x+w/2+12, y+22, 14,"#ecdaa0","center","bold");

    // Preis / Status
    const bx=x+68, by=y+h-36, bw=w-78, bh=26;
    if (isSel) {
      ctx.fillStyle="#3ad17a"; rRect(bx,by,bw,bh,7); ctx.fill();
      ptxt("✓ Aktiv", bx+bw/2,by+bh/2+1,13,"#fff","center","bold");
    } else if (isOwn) {
      ctx.fillStyle="#3a608a"; rRect(bx,by,bw,bh,7); ctx.fill();
      ptxt("Auswählen", bx+bw/2,by+bh/2+1,12,"#9dd4ff","center","bold");
    } else {
      ctx.fillStyle=canBuy?"#b87820":"#302a22"; rRect(bx,by,bw,bh,7); ctx.fill();
      drawCoin(bx+12,by+bh/2,8,animT*4);
      ptxt(String(skin.price), bx+23,by+bh/2+1,13,canBuy?"#ffe680":"#7a6a4a","left","bold");
      if (!canBuy) { ctx.fillStyle="rgba(0,0,0,0.32)"; rRect(x,y,w,h,12); ctx.fill(); }
    }
  }

  function drawReady() {
    txt("Mach dich bereit!", W/2,150,26,"#fff");
    if (Math.sin(animT*5)>-0.3) {
      ctx.strokeStyle="#fff"; ctx.lineWidth=4; ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(W/2,268); ctx.lineTo(W/2,238);
      ctx.moveTo(W/2-10,248); ctx.lineTo(W/2,236); ctx.lineTo(W/2+10,248);
      ctx.stroke();
      ptxt("Tippen zum Fliegen", W/2,296,16,"rgba(255,255,255,0.95)","center","bold");
    }
    drawHud();
  }

  function drawHud() {
    txt(String(score), W/2,66,48);
    coinBadge(W-108,12,coinsRun);
    // Tempo-Balken
    const d=DIFF[diffKey], prog=Math.min(1,(speed-d.base)/(d.max-d.base));
    const bx=W/2-40, by=100, bw=80, bh=7;
    ctx.fillStyle="rgba(0,0,0,0.3)"; rRect(bx,by,bw,bh,3); ctx.fill();
    const sg=ctx.createLinearGradient(bx,0,bx+bw,0);
    sg.addColorStop(0,"#3ad17a"); sg.addColorStop(0.5,"#ffb03a"); sg.addColorStop(1,"#ff5252");
    ctx.fillStyle=sg; rRect(bx,by,bw*prog,bh,3); ctx.fill();
    ptxt("TEMPO",W/2,by+18,10,"rgba(255,255,255,0.8)");
  }

  function drawGameOver() {
    if (gameOverTimer<0.35) return;
    ctx.save(); ctx.shadowColor="rgba(0,0,0,0.3)"; ctx.shadowBlur=8; ctx.shadowOffsetY=4;
    txt("Game Over", W/2,120,44,"#ff6b4a");
    ctx.restore();

    const pw=290, ph=184, px=(W-pw)/2;
    const slide=Math.max(0,0.65-gameOverTimer)*220, py=162+slide;
    ctx.fillStyle="#f3e4b8"; ctx.strokeStyle="#8a7340"; ctx.lineWidth=3;
    rRect(px,py,pw,ph,14); ctx.fill(); ctx.stroke();

    // Medaille
    const med=medalFor(score), mcx=px+56, mcy=py+76;
    ctx.beginPath(); ctx.arc(mcx,mcy,34,0,Math.PI*2);
    if (med) {
      const g=ctx.createRadialGradient(mcx-8,mcy-8,4,mcx,mcy,34);
      g.addColorStop(0,med.light); g.addColorStop(1,med.color);
      ctx.fillStyle=g; ctx.fill();
      ctx.strokeStyle=med.rim; ctx.lineWidth=4; ctx.stroke();
      ptxt(med.name,mcx,mcy,12,med.rim,"center","bold");
    } else {
      ctx.fillStyle="#e7dcc0"; ctx.fill(); ctx.strokeStyle="#c2b48c"; ctx.lineWidth=3; ctx.stroke();
      ptxt("–",mcx,mcy,24,"#b3a677","center","bold");
    }

    // Werte rechts
    const rx=px+pw-22;
    ptxt("PUNKTE",    rx, py+28, 13,"#b3552e","right","bold");
    ptxt(String(score), rx, py+52, 28,"#5a3d00","right","bold");
    ptxt("BESTWERT",  rx, py+94, 13,"#b3552e","right","bold");
    ptxt(String(getBest()), rx, py+118, 28, DIFF[diffKey].color,"right","bold");

    drawCoin(px+108,py+158,10,animT*4);
    ptxt("+"+coinsRun+" Coins", px+122,py+158,14,"#7a5a1e","left","bold");

    if (newBest) {
      ctx.save(); ctx.translate(rx-94,py+93); ctx.rotate(-0.13);
      ctx.fillStyle="#e84e3c"; rRect(-26,-11,52,22,5); ctx.fill();
      ctx.strokeStyle="#fff"; ctx.lineWidth=1.5; rRect(-26,-11,52,22,5); ctx.stroke();
      ptxt("NEU!",0,1,13,"#fff","center","bold");
      ctx.restore();
    }

    if (gameOverTimer>0.55) {
      const by=py+ph+16;
      btn("Nochmal", W/2-150,by,140,48,()=>startReady(),{pulse:true,fs:20});
      btn("Menü",    W/2+10, by,140,48,()=>{state=S.MENU;},{bg:"#7ec8ff",border:"#3a8fd0",tc:"#0a3a5a",fs:20});
    }
  }

  function medalFor(s) {
    if (s>=40) return {name:"PLATIN",color:"#cfd8dc",light:"#fff",rim:"#8fa0a8"};
    if (s>=30) return {name:"GOLD",  color:"#ffd233",light:"#fff2a0",rim:"#b8860b"};
    if (s>=20) return {name:"SILBER",color:"#c4cace",light:"#f0f3f5",rim:"#8b9296"};
    if (s>=10) return {name:"BRONZE",color:"#cd7f32",light:"#e8a86a",rim:"#8c5a20"};
    return null;
  }

  function drawToast() {
    const a=Math.min(1,toast.t*2), tw=260, th=40, tx=(W-tw)/2, ty=H-146;
    ctx.globalAlpha=a;
    ctx.fillStyle="rgba(0,0,0,0.82)"; rRect(tx,ty,tw,th,10); ctx.fill();
    ptxt(toast.text, W/2,ty+th/2+1,15,"#ffe680","center","bold");
    ctx.globalAlpha=1;
  }

  // ============================================================
  //  Haupt-Draw
  // ============================================================
  function draw() {
    hitRegions = [];
    drawBg(); drawPipes(); drawCoins(); drawParticles(); drawGround();

    // Vogel: im Menü mittig, sonst links fest
    if (state !== S.SHOP && state !== S.MENU) drawBird(BIRD_X, bird.y, bird.rot, bird.wingFrame, skinById(curSkin));

    switch (state) {
      case S.MENU:     drawMenu();     break;
      case S.SHOP:     drawShop();     break;
      case S.READY:    drawReady();    break;
      case S.PLAYING:  drawHud();      break;
      case S.DYING:
      case S.GAMEOVER: drawHud(); drawGameOver(); break;
    }

    if (overlay === "settings") drawSettings();
    if (toast) drawToast();

    if (flashAlpha > 0) { ctx.fillStyle=`rgba(255,255,255,${flashAlpha})`; ctx.fillRect(0,0,W,H); }
  }

  // ============================================================
  //  Initialisierung & Loop
  // ============================================================
  bird     = { y: H/2-40, vy:0, rot:0, wingFrame:0, wingTimer:0 };
  pipes    = []; coinEnts = []; particles = [];
  score    = 0; pipesPassed = 0; coinsRun = 0;
  speed    = DIFF[diffKey].base;

  function loop(time) {
    const dt = Math.min((time - lastTime) / 1000, 1/30);
    lastTime = time;
    update(dt); draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(t => { lastTime = t; requestAnimationFrame(loop); });
})();
