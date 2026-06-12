/* ============================================================
   Flappy Bird – vollständiger Klon in reinem JavaScript
   Steuerung: Leertaste / Pfeil hoch / W / Mausklick / Touch
   ============================================================ */
(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const W = canvas.width;   // 400
  const H = canvas.height;  // 600

  // ---------- Spielkonstanten ----------
  const GROUND_H = 90;
  const GRAVITY = 1500;          // px/s²
  const FLAP_VELOCITY = -420;    // px/s
  const MAX_FALL_SPEED = 700;    // px/s
  const PIPE_SPEED = 150;        // px/s
  const PIPE_GAP = 150;          // Lücke zwischen den Röhren
  const PIPE_WIDTH = 70;
  const PIPE_SPACING = 220;      // horizontaler Abstand der Röhrenpaare
  const BIRD_X = 100;
  const BIRD_R = 14;             // Kollisionsradius

  // ---------- Spielzustände ----------
  const State = { MENU: 0, READY: 1, PLAYING: 2, DYING: 3, GAMEOVER: 4 };
  let state = State.MENU;

  // ---------- Spielvariablen ----------
  let bird = { y: H / 2, vy: 0, rot: 0, wingFrame: 0, wingTimer: 0 };
  let pipes = [];                // { x, gapY, scored }
  let score = 0;
  let best = Number(localStorage.getItem("flappy-best") || 0);
  let groundX = 0;
  let bgX = 0;
  let cloudX = 0;
  let lastTime = 0;
  let flashAlpha = 0;            // weißer Blitz beim Aufprall
  let gameOverTimer = 0;         // Verzögerung, bis Game-Over-Panel erscheint
  let menuBobT = 0;              // Schweben des Vogels im Menü
  let newBest = false;

  // ---------- Sound (WebAudio, ohne externe Dateien) ----------
  let audioCtx = null;
  function sound(freq, duration, type = "square", volume = 0.15, slide = 0) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), audioCtx.currentTime + duration);
      gain.gain.setValueAtTime(volume, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) { /* Sound ist optional */ }
  }
  const sfx = {
    flap:  () => sound(500, 0.08, "square", 0.08, 200),
    score: () => { sound(880, 0.08, "square", 0.1); setTimeout(() => sound(1320, 0.1, "square", 0.1), 80); },
    hit:   () => sound(200, 0.25, "sawtooth", 0.18, -150),
    die:   () => sound(400, 0.4, "sawtooth", 0.12, -350),
    swoosh:() => sound(600, 0.12, "sine", 0.08, -300),
  };

  // ============================================================
  //  Eingabe
  // ============================================================
  function primaryAction() {
    switch (state) {
      case State.MENU:
        startReady();
        break;
      case State.READY:
        state = State.PLAYING;
        flap();
        break;
      case State.PLAYING:
        flap();
        break;
      case State.GAMEOVER:
        if (gameOverTimer > 0.6) { // verhindert versehentlichen Sofort-Neustart
          startReady();
          sfx.swoosh();
        }
        break;
    }
  }

  function flap() {
    bird.vy = FLAP_VELOCITY;
    sfx.flap();
  }

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
      e.preventDefault();
      if (!e.repeat) primaryAction();
    }
  });
  canvas.addEventListener("mousedown", (e) => { e.preventDefault(); primaryAction(); });
  canvas.addEventListener("touchstart", (e) => { e.preventDefault(); primaryAction(); }, { passive: false });

  // ============================================================
  //  Spielablauf
  // ============================================================
  function startReady() {
    state = State.READY;
    bird = { y: H / 2 - 30, vy: 0, rot: 0, wingFrame: 0, wingTimer: 0 };
    pipes = [];
    score = 0;
    newBest = false;
    flashAlpha = 0;
    gameOverTimer = 0;
  }

  function spawnPipe(x) {
    const margin = 60;
    const minY = margin + PIPE_GAP / 2;
    const maxY = H - GROUND_H - margin - PIPE_GAP / 2;
    const gapY = minY + Math.random() * (maxY - minY);
    pipes.push({ x, gapY, scored: false });
  }

  function die() {
    if (state === State.PLAYING) {
      state = State.DYING;
      flashAlpha = 1;
      sfx.hit();
      setTimeout(() => sfx.die(), 150);
      if (score > best) {
        best = score;
        newBest = true;
        localStorage.setItem("flappy-best", String(best));
      }
    }
  }

  function update(dt) {
    menuBobT += dt;

    // Hintergrund & Boden scrollen (außer bei Tod/Game Over)
    if (state !== State.DYING && state !== State.GAMEOVER) {
      groundX = (groundX - PIPE_SPEED * dt) % 24;
      bgX = (bgX - PIPE_SPEED * 0.2 * dt) % W;
      cloudX = (cloudX - PIPE_SPEED * 0.35 * dt) % W;
    }

    // Flügelschlag-Animation
    bird.wingTimer += dt;
    const wingSpeed = state === State.PLAYING || state === State.READY || state === State.MENU ? 0.09 : 1e9;
    if (bird.wingTimer > wingSpeed) {
      bird.wingTimer = 0;
      bird.wingFrame = (bird.wingFrame + 1) % 3;
    }

    if (state === State.MENU || state === State.READY) {
      // Vogel schwebt sanft auf und ab
      bird.y = (state === State.MENU ? H / 2 - 40 : H / 2 - 30) + Math.sin(menuBobT * 4) * 8;
      bird.rot = 0;
      return;
    }

    if (state === State.PLAYING || state === State.DYING) {
      // Physik
      bird.vy = Math.min(bird.vy + GRAVITY * dt, MAX_FALL_SPEED);
      bird.y += bird.vy * dt;

      // Rotation: Nase hoch beim Flattern, Sturzflug beim Fallen
      const targetRot = bird.vy < 0 ? -0.45 : Math.min(1.4, bird.vy / 350);
      bird.rot += (targetRot - bird.rot) * Math.min(1, dt * 12);

      // Deckenbegrenzung
      if (bird.y < BIRD_R) { bird.y = BIRD_R; bird.vy = 0; }

      // Bodenkollision
      if (bird.y > H - GROUND_H - BIRD_R) {
        bird.y = H - GROUND_H - BIRD_R;
        die();
        state = State.GAMEOVER;
      }
    }

    if (state === State.PLAYING) {
      // Röhren bewegen
      for (const p of pipes) p.x -= PIPE_SPEED * dt;

      // Neue Röhren erzeugen
      if (pipes.length === 0) {
        spawnPipe(W + 100);
      } else if (pipes[pipes.length - 1].x < W - PIPE_SPACING) {
        spawnPipe(pipes[pipes.length - 1].x + PIPE_SPACING);
      }

      // Röhren außerhalb des Bildschirms entfernen
      pipes = pipes.filter((p) => p.x > -PIPE_WIDTH);

      // Punkte & Kollision
      for (const p of pipes) {
        if (!p.scored && p.x + PIPE_WIDTH < BIRD_X) {
          p.scored = true;
          score++;
          sfx.score();
        }
        if (collides(p)) die();
      }
    }

    if (state === State.DYING || state === State.GAMEOVER) {
      gameOverTimer += dt;
      flashAlpha = Math.max(0, flashAlpha - dt * 3);
    }
  }

  function collides(p) {
    // Kreis (Vogel) gegen die beiden Rechtecke der Röhre
    const topRect = { x: p.x, y: 0, w: PIPE_WIDTH, h: p.gapY - PIPE_GAP / 2 };
    const botRect = { x: p.x, y: p.gapY + PIPE_GAP / 2, w: PIPE_WIDTH, h: H - GROUND_H - (p.gapY + PIPE_GAP / 2) };
    return circleRect(BIRD_X, bird.y, BIRD_R, topRect) || circleRect(BIRD_X, bird.y, BIRD_R, botRect);
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
    drawBackground();
    drawPipes();
    drawGround();
    drawBird();

    switch (state) {
      case State.MENU: drawMenu(); break;
      case State.READY: drawReady(); break;
      case State.PLAYING: drawScore(); break;
      case State.DYING:
      case State.GAMEOVER: drawGameOver(); break;
    }

    // Aufprall-Blitz
    if (flashAlpha > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawBackground() {
    // Himmel
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#4ec0ca");
    sky.addColorStop(0.7, "#7fdde6");
    sky.addColorStop(1, "#aeeef2");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Wolken (zwei Kacheln für nahtloses Scrollen)
    for (let off = 0; off < 2; off++) {
      const x0 = cloudX + off * W;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      drawCloud(x0 + 50, 110, 1.0);
      drawCloud(x0 + 200, 70, 0.7);
      drawCloud(x0 + 320, 140, 0.85);
    }

    // Stadt-Silhouette
    const cityY = H - GROUND_H;
    for (let off = 0; off < 2; off++) {
      const x0 = bgX + off * W;
      ctx.fillStyle = "#c8f0d8";
      const buildings = [
        [10, 60, 36], [55, 90, 30], [95, 50, 40], [145, 75, 28],
        [180, 55, 45], [235, 95, 26], [270, 65, 38], [318, 80, 32], [358, 50, 40],
      ];
      for (const [bx, bh, bw] of buildings) {
        ctx.fillRect(x0 + bx, cityY - bh, bw, bh);
      }
      // Bäume/Büsche davor
      ctx.fillStyle = "#9ce3b0";
      for (let i = 0; i < 10; i++) {
        const tx = x0 + i * 42 + 8;
        ctx.beginPath();
        ctx.arc(tx, cityY, 16, Math.PI, 0);
        ctx.fill();
      }
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
    for (const p of pipes) {
      const topH = p.gapY - PIPE_GAP / 2;
      const botY = p.gapY + PIPE_GAP / 2;
      drawPipe(p.x, 0, topH, true);
      drawPipe(p.x, botY, H - GROUND_H - botY, false);
    }
  }

  function drawPipe(x, y, h, isTop) {
    if (h <= 0) return;
    const capH = 26;
    const capOverhang = 4;

    // Rohrkörper mit vertikalem Verlauf (3D-Look)
    const body = ctx.createLinearGradient(x, 0, x + PIPE_WIDTH, 0);
    body.addColorStop(0, "#578a2a");
    body.addColorStop(0.15, "#9ade49");
    body.addColorStop(0.45, "#c7f06e");
    body.addColorStop(0.7, "#74b834");
    body.addColorStop(1, "#46701f");
    ctx.fillStyle = body;
    ctx.fillRect(x, y, PIPE_WIDTH, h);
    ctx.strokeStyle = "#2e4d14";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y - 2, PIPE_WIDTH - 2, h + 4);

    // Kappe am offenen Ende
    const capY = isTop ? y + h - capH : y;
    const cap = ctx.createLinearGradient(x - capOverhang, 0, x + PIPE_WIDTH + capOverhang, 0);
    cap.addColorStop(0, "#578a2a");
    cap.addColorStop(0.15, "#a8e85a");
    cap.addColorStop(0.45, "#d2f47e");
    cap.addColorStop(0.7, "#7cc23a");
    cap.addColorStop(1, "#46701f");
    ctx.fillStyle = cap;
    ctx.fillRect(x - capOverhang, capY, PIPE_WIDTH + capOverhang * 2, capH);
    ctx.strokeRect(x - capOverhang + 1, capY + 1, PIPE_WIDTH + capOverhang * 2 - 2, capH - 2);
  }

  function drawGround() {
    const gy = H - GROUND_H;

    // Erde
    ctx.fillStyle = "#ded895";
    ctx.fillRect(0, gy, W, GROUND_H);

    // Grasstreifen oben
    ctx.fillStyle = "#73bf2e";
    ctx.fillRect(0, gy, W, 14);
    ctx.fillStyle = "#9be060";
    for (let x = groundX - 24; x < W + 24; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, gy + 14);
      ctx.lineTo(x + 12, gy);
      ctx.lineTo(x + 24, gy + 14);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#5a9e22";
    ctx.fillRect(0, gy + 14, W, 3);

    // Punktmuster in der Erde
    ctx.fillStyle = "#cbc27c";
    for (let x = groundX - 24; x < W + 24; x += 24) {
      for (let row = 0; row < 3; row++) {
        ctx.fillRect(x + (row % 2) * 12, gy + 30 + row * 18, 8, 8);
      }
    }
  }

  function drawBird() {
    ctx.save();
    ctx.translate(BIRD_X, bird.y);
    ctx.rotate(bird.rot);

    // Körper
    ctx.fillStyle = "#f8d147";
    ctx.strokeStyle = "#5b4a14";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Bauch
    ctx.fillStyle = "#fdf2cd";
    ctx.beginPath();
    ctx.ellipse(-2, 5, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Flügel (3 Animationsphasen)
    const wingY = [-2, 2, 6][bird.wingFrame];
    ctx.fillStyle = "#fbeaa0";
    ctx.beginPath();
    ctx.ellipse(-5, wingY, 8, 5.5, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Auge
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(7, -4, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#2b2b2b";
    ctx.beginPath();
    ctx.arc(8.5, -4, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Schnabel
    ctx.fillStyle = "#f3722c";
    ctx.beginPath();
    ctx.moveTo(12, 1);
    ctx.lineTo(22, 3);
    ctx.lineTo(12, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  // ---------- Text-Hilfsfunktionen ----------
  function outlinedText(text, x, y, size, fill = "#ffffff", align = "center") {
    ctx.font = `bold ${size}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(3, size / 8);
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#3b3b3b";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  function drawScore() {
    outlinedText(String(score), W / 2, 70, 48);
  }

  function drawMenu() {
    outlinedText("Flappy Bird", W / 2, 140, 48, "#ffe14d");

    // Blinkende Start-Aufforderung
    if (Math.sin(menuBobT * 5) > -0.3) {
      outlinedText("Tippen oder Leertaste", W / 2, 360, 22);
      outlinedText("zum Starten", W / 2, 390, 22);
    }

    outlinedText(`Rekord: ${best}`, W / 2, 460, 20, "#ffffff");

    ctx.font = "14px 'Segoe UI', Arial, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.textAlign = "center";
    ctx.fillText("Steuerung: Leertaste / ↑ / W / Klick / Touch", W / 2, H - GROUND_H + 55);
  }

  function drawReady() {
    drawScore();
    outlinedText("Bereit?", W / 2, 180, 36, "#7ee35c");

    // Tipp-Anleitung
    const cx = W / 2, cy = 300;
    if (Math.sin(menuBobT * 5) > -0.3) {
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#3b3b3b";
      ctx.lineWidth = 3;
      ctx.stroke();
      // Hand/Pfeil nach oben
      ctx.beginPath();
      ctx.moveTo(cx, cy - 26);
      ctx.lineTo(cx, cy - 50);
      ctx.moveTo(cx - 8, cy - 42);
      ctx.lineTo(cx, cy - 52);
      ctx.lineTo(cx + 8, cy - 42);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }

  function drawGameOver() {
    if (gameOverTimer < 0.4) return; // kurze Pause vor dem Panel

    outlinedText("Game Over", W / 2, 150, 42, "#ff6b4a");

    // Panel
    const pw = 280, ph = 160;
    const px = (W - pw) / 2;
    const py = 200 + Math.max(0, (0.7 - gameOverTimer)) * 200; // gleitet hoch
    ctx.fillStyle = "#e8d6a0";
    ctx.strokeStyle = "#8a7340";
    ctx.lineWidth = 3;
    roundRect(px, py, pw, ph, 10);
    ctx.fill();
    ctx.stroke();

    // Medaille
    const medal = medalFor(score);
    if (medal) {
      ctx.beginPath();
      ctx.arc(px + 55, py + ph / 2, 28, 0, Math.PI * 2);
      ctx.fillStyle = medal.color;
      ctx.fill();
      ctx.strokeStyle = medal.rim;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.font = "bold 13px 'Segoe UI', Arial, sans-serif";
      ctx.fillStyle = medal.rim;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(medal.name, px + 55, py + ph / 2);
    } else {
      ctx.font = "13px 'Segoe UI', Arial, sans-serif";
      ctx.fillStyle = "#8a7340";
      ctx.textAlign = "center";
      ctx.fillText("Keine", px + 55, py + ph / 2 - 8);
      ctx.fillText("Medaille", px + 55, py + ph / 2 + 8);
    }

    // Punkte
    ctx.font = "bold 16px 'Segoe UI', Arial, sans-serif";
    ctx.fillStyle = "#b3552e";
    ctx.textAlign = "right";
    ctx.fillText("PUNKTE", px + pw - 25, py + 35);
    outlinedText(String(score), px + pw - 45, py + 62, 28, "#ffffff", "right");

    ctx.font = "bold 16px 'Segoe UI', Arial, sans-serif";
    ctx.fillStyle = "#b3552e";
    ctx.textAlign = "right";
    ctx.fillText("REKORD", px + pw - 25, py + 95);
    outlinedText(String(best), px + pw - 45, py + 122, 28, "#ffffff", "right");

    if (newBest) {
      ctx.save();
      ctx.translate(px + pw - 30, py + 88);
      ctx.rotate(0.25);
      ctx.fillStyle = "#e84e3c";
      roundRect(-24, -10, 48, 20, 4);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px 'Segoe UI', Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("NEU!", 0, 1);
      ctx.restore();
    }

    if (gameOverTimer > 0.9 && Math.sin(menuBobT * 5) > -0.3) {
      outlinedText("Tippen für Neustart", W / 2, py + ph + 50, 22);
    }
  }

  function medalFor(s) {
    if (s >= 40) return { name: "PLATIN", color: "#e5e4e2", rim: "#9a9a98" };
    if (s >= 30) return { name: "GOLD", color: "#ffd700", rim: "#b8960b" };
    if (s >= 20) return { name: "SILBER", color: "#c0c0c0", rim: "#8c8c8c" };
    if (s >= 10) return { name: "BRONZE", color: "#cd7f32", rim: "#8c5a20" };
    return null;
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

  // ============================================================
  //  Hauptschleife
  // ============================================================
  function loop(time) {
    const dt = Math.min((time - lastTime) / 1000, 1 / 30); // dt begrenzen (Tab-Wechsel)
    lastTime = time;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame((t) => {
    lastTime = t;
    requestAnimationFrame(loop);
  });
})();
