// Rain-on-water surface simulation: ripples + splash droplets on a tilted
// perspective water plane, rendered on a dark background (night pond scene).
// Key parameters are exposed live via the #controls panel in index.html.

(function () {
  "use strict";

  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");

  // ---- Tunables (perspective/visual constants, not user-facing) --------
  const HORIZON_RATIO = 0.14;   // where the water plane meets the horizon (top)
  const PERSPECTIVE_POW = 2.3;  // >1 compresses far distance near the horizon
  const TILT_RATIO = 0.42;      // vertical squash of ripple ellipses (viewing angle)
  const SPREAD = 1.15;          // how wide the plane fans out toward the camera
  const RING_GROWTH_TAU = 0.6;  // seconds to approach max radius
  const GRAVITY = 2.6;          // world units / s^2 for splash droplets
  const RING_SPEED = 4;         // ripple appear/fade speed multiplier - independent of config.speed

  // ---- Live-adjustable parameters, driven by the #controls panel -------
  const config = {
    spawnRate: 8,     // 빗방울 수: average drops / second
    ringLife: 4.2,    // 동심원 밀도: seconds a ripple lingers before disappearing
    speed: 1,         // 애니메이션 속도: global time multiplier
    bgColor: "#020204",
    blur: 1.2,        // 블러(사실감): gaussian blur radius (px) over the whole scene
    fullView: false,  // 전체뷰: false = 원근(소실점) 투영, true = 화면 전체에 고르게
  };

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex) || [];
    return { r: parseInt(m[1] || "02", 16), g: parseInt(m[2] || "02", 16), b: parseInt(m[3] || "04", 16) };
  }
  function shade(hex, factor) {
    const { r, g, b } = hexToRgb(hex);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * factor)));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }

  function bindControls() {
    const $ = (id) => document.getElementById(id);
    const rate = $("rate"), life = $("life"), speed = $("speed"), bgColor = $("bgColor"), blur = $("blur"), fullView = $("fullView");
    const rateVal = $("rateVal"), lifeVal = $("lifeVal"), speedVal = $("speedVal"), blurVal = $("blurVal");
    const toggle = $("controlsToggle"), panel = $("controls");

    const sync = () => {
      config.spawnRate = parseFloat(rate.value);
      config.ringLife = parseFloat(life.value);
      config.speed = parseFloat(speed.value);
      config.bgColor = bgColor.value;
      config.blur = parseFloat(blur.value);
      config.fullView = fullView.checked;
      rateVal.textContent = config.spawnRate.toFixed(1);
      lifeVal.textContent = config.ringLife.toFixed(1);
      speedVal.textContent = config.speed.toFixed(1);
      blurVal.textContent = config.blur.toFixed(1);
    };
    [rate, life, speed, bgColor, blur, fullView].forEach((el) => el.addEventListener("input", sync));
    sync();

    toggle.addEventListener("click", () => panel.classList.toggle("collapsed"));
  }
  if (document.getElementById("controls")) bindControls();

  let W = 0, H = 0, DPR = 1;
  let horizonY = 0;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    horizonY = H * HORIZON_RATIO;
  }
  window.addEventListener("resize", resize);
  resize();

  // ---- Projection ---------------------------------------------------------
  // World coords: x in [-1, 1] (left-right), z in [0, 1] (0 = far/horizon, 1 = near/bottom)
  //
  // 원근뷰 (default): a tilted-camera view of a flat water plane. The same
  // world-space width covers fewer screen pixels near the horizon than near
  // the camera - exactly like train tracks converging on a vanishing point -
  // so rain that's actually spread evenly over the whole surface reads as a
  // narrowing wedge on screen.
  //
  // 전체뷰: x and z map straight to screen space with no depth-based
  // narrowing or size falloff, so the same world-space rain distribution
  // instead covers the frame evenly edge-to-edge.
  function project(x, z) {
    if (config.fullView) {
      const screenY = horizonY + z * (H - horizonY);
      const halfWidth = W / 2;
      const screenX = W / 2 + x * halfWidth;
      return { x: screenX, y: screenY, scale: 1 };
    }
    const depth = Math.pow(z, PERSPECTIVE_POW);
    const screenY = horizonY + depth * (H - horizonY);
    const halfWidth = (screenY - horizonY) * SPREAD + 20;
    const screenX = W / 2 + x * halfWidth;
    const scale = 0.15 + depth * 1.6; // size multiplier: bigger near camera
    return { x: screenX, y: screenY, scale };
  }

  // ---- Entities -----------------------------------------------------------
  const ripples = [];
  const particles = [];
  const ambient = [];

  function spawnRipple(x, z) {
    const maxRadius = 0.06 + Math.random() * 0.16;
    ripples.push({
      x, z,
      born: clock,
      maxRadius,
      hasInnerRing: Math.random() < 0.45,
    });
  }

  function spawnSplash(x, z) {
    const count = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spread = 0.01 + Math.random() * 0.035;
      particles.push({
        x, z,
        vx: Math.cos(angle) * spread,
        vz: Math.sin(angle) * spread * 0.6,
        h: 0,
        vh: 0.55 + Math.random() * 0.5,
        born: clock,
        life: 0.35 + Math.random() * 0.35,
        size: 0.008 + Math.random() * 0.014,
      });
    }
  }

  function spawnAmbient() {
    // faint drifting motes for atmosphere, like dust/mist in the reference frame
    for (let i = 0; i < 26; i++) {
      ambient.push({
        x: (Math.random() * 2 - 1) * 1.3,
        z: Math.random(),
        phase: Math.random() * Math.PI * 2,
        speed: 0.15 + Math.random() * 0.3,
        r: 0.006 + Math.random() * 0.01,
        alpha: 0.15 + Math.random() * 0.35,
      });
    }
  }
  spawnAmbient();

  // ---- Drawing helpers ----------------------------------------------------
  function drawRing(sx, sy, screenR, alpha, lineWidth) {
    if (alpha <= 0.005 || screenR <= 0.3) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgba(230,235,240,1)";
    ctx.lineWidth = lineWidth;
    ctx.shadowColor = "rgba(200,210,255,0.9)";
    ctx.shadowBlur = 6 + screenR * 0.15;
    ctx.beginPath();
    ctx.ellipse(sx, sy, screenR, screenR * TILT_RATIO, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawGlowDot(sx, sy, r, alpha, color) {
    if (alpha <= 0.005 || r <= 0.15) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---- Simulation update ---------------------------------------------------
  let clock = 0;
  let nextSpawn = 0;

  function updateAndDraw(rawDt) {
    const dt = rawDt * config.speed;
    clock += dt;

    // background: subtle vertical gradient derived from the user-picked color
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, shade(config.bgColor, 1.6));
    bg.addColorStop(0.5, shade(config.bgColor, 0.4));
    bg.addColorStop(1, shade(config.bgColor, 1.1));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // spawn new impacts
    if (config.spawnRate > 0.01) {
      if (clock >= nextSpawn) {
        const z = Math.pow(Math.random(), 1.4); // bias toward farther/smaller drops
        const x = (Math.random() * 2 - 1) * 1.05;
        spawnRipple(x, z);
        spawnSplash(x, z);
        const rate = config.spawnRate * (0.75 + Math.random() * 0.5);
        nextSpawn = clock + 1 / rate;
      }
    } else {
      nextSpawn = clock; // resumes immediately once the rate is raised again
    }

    // Soft focus over the ripples/splashes/motes only - keeps the crisp
    // background gradient edge-free while everything else reads like it was
    // shot slightly out of focus, closer to real rain-on-water footage.
    ctx.filter = config.blur > 0 ? `blur(${config.blur}px)` : "none";

    // ambient motes
    for (const a of ambient) {
      const p = project(a.x, a.z);
      const flicker = 0.6 + 0.4 * Math.sin(clock * a.speed * 3 + a.phase);
      drawGlowDot(p.x, p.y, a.r * 60 * p.scale, a.alpha * flicker, "rgba(180,200,230,1)");
    }

    // ripples
    const ringMaxLife = config.ringLife;
    const ringDecayTau = Math.max(0.15, config.ringLife / 3);
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      const t = (clock - r.born) * RING_SPEED;
      if (t > ringMaxLife) { ripples.splice(i, 1); continue; }

      const growth = 1 - Math.exp(-t / RING_GROWTH_TAU);
      const worldR = r.maxRadius * growth;
      const alpha = Math.exp(-t / ringDecayTau) * 0.9;

      const p = project(r.x, r.z);
      const screenR = worldR * 220 * p.scale;
      const lineWidth = Math.max(0.6, (1.8 - worldR * 4) * p.scale);
      drawRing(p.x, p.y, screenR, alpha, lineWidth);

      if (r.hasInnerRing) {
        const innerT = Math.max(0, t - 0.12);
        const innerGrowth = 1 - Math.exp(-innerT / RING_GROWTH_TAU);
        const innerWorldR = r.maxRadius * 0.6 * innerGrowth;
        const innerAlpha = Math.exp(-innerT / (ringDecayTau * 0.8)) * 0.6;
        const innerScreenR = innerWorldR * 220 * p.scale;
        drawRing(p.x, p.y, innerScreenR, innerAlpha, lineWidth * 0.8);
      }
    }

    // splash particles (droplets flying up then falling back to the surface)
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      const t = clock - pt.born;
      if (t > pt.life) { particles.splice(i, 1); continue; }

      pt.h = pt.vh * t - 0.5 * GRAVITY * t * t;
      if (pt.h < 0) { particles.splice(i, 1); continue; }

      const wx = pt.x + pt.vx * t;
      const wz = Math.min(1, Math.max(0, pt.z + pt.vz * t));
      const proj = project(wx, wz);
      const heightOffset = pt.h * 140 * proj.scale;
      const alpha = 1 - t / pt.life;
      const r = pt.size * 90 * proj.scale * (0.7 + 0.3 * alpha);
      drawGlowDot(proj.x, proj.y - heightOffset, r, alpha, "rgba(235,240,255,1)");
    }

    ctx.filter = "none";

    const rippleCountEl = document.getElementById("rippleCount");
    const particleCountEl = document.getElementById("particleCount");
    if (rippleCountEl) rippleCountEl.textContent = ripples.length;
    if (particleCountEl) particleCountEl.textContent = particles.length;

    requestAnimationFrame(loop);
  }

  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    updateAndDraw(dt);
  }
  requestAnimationFrame(loop);
})();
