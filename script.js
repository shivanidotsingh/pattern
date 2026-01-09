(() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const audioEl = document.getElementById('track');

  // ===== Layout tuning =====
  const TILE_BASE = 20;
  const GRID_SCALE = 0.8;
  const TILE = Math.max(10, Math.round(TILE_BASE * GRID_SCALE));

  let GRID_COLS = 0;
  let GRID_ROWS = 0;
  let GRID_OX = 0;
  let GRID_OY = 0;

  const CSS = getComputedStyle(document.documentElement);
  const BG     = CSS.getPropertyValue('--bg').trim()     || '#6b0f1a';
  const CREAM  = CSS.getPropertyValue('--cream').trim()  || '#f3e7d3';
  const HALDI  = CSS.getPropertyValue('--haldi').trim()  || '#f2b705';
  const BLACK  = CSS.getPropertyValue('--black').trim()  || '#140f12';

  // --- Tiny sanity checks ---
  function assert(cond, msg){ if(!cond) throw new Error(msg); }
  function validateColors(){
    const ok = c => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c);
    assert(ok(BG) && ok(CREAM) && ok(HALDI) && ok(BLACK), 'One of the CSS colors is not a hex value.');
  }
  function validateAudio(){
    assert(audioEl instanceof HTMLAudioElement, 'Audio element not found.');
  }

  function recomputeGrid() {
    GRID_COLS = Math.floor(window.innerWidth / TILE);
    GRID_ROWS = Math.floor(window.innerHeight / TILE);
    GRID_OX = Math.floor((window.innerWidth - GRID_COLS * TILE) / 2);
    GRID_OY = Math.floor((window.innerHeight - GRID_ROWS * TILE) / 2);
  }

  function resize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    recomputeGrid();
    rebuildPattern();
  }

  function cols() { return GRID_COLS; }
  function rows() { return GRID_ROWS; }

  function clear() {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  }

  function drawTile(gx, gy, color) {
    ctx.fillStyle = color;
    ctx.fillRect(GRID_OX + gx * TILE, GRID_OY + gy * TILE, TILE, TILE);
  }

  // ===== Pattern generation (perfect symmetry) =====
  function hash2(a, b, seed) {
    a |= 0; b |= 0; seed |= 0;
    let h = seed ^ Math.imul(a, 0x9E3779B1) ^ Math.imul(b, 0x85EBCA6B);
    h ^= h >>> 16;
    h = Math.imul(h, 0x85EBCA6B);
    h ^= h >>> 13;
    h = Math.imul(h, 0xC2B2AE35);
    h ^= h >>> 16;
    return h >>> 0;
  }
  function hash01(a, b, seed) {
    return hash2(a, b, seed) / 4294967296;
  }

  const MODES = ['Rosette Dots','Diamond Dots','Weave Dots','Scallop Dots','Petal Dots'];
  const pick = (arr, seed) => arr[hash2(seed, seed ^ 0xA3, 0xC0FFEE) % arr.length];
  const lerp = (a,b,t) => a + (b-a)*t;

  function generateParams(seed) {
    const mode = pick(MODES, seed);
    const u1 = hash01(1, 2, seed);
    const u2 = hash01(3, 4, seed);
    const u3 = hash01(5, 6, seed);
    const u4 = hash01(7, 8, seed);
    const u5 = hash01(9,10, seed);
    const u6 = hash01(11,12, seed);

    const f1 = lerp(0.12, 0.44, u1);
    const f2 = lerp(0.10, 0.62, u2);
    const f3 = lerp(0.08, 0.38, u3);
    const phase = u4 * Math.PI * 2;

    const petals = [6, 8, 10, 12, 14, 16][Math.floor(u5 * 6) % 6];
    const twist  = [0.0, 0.16, 0.28, 0.42, 0.6][Math.floor(u6 * 5) % 5];

    const spacing = 4 + (hash2(21, 22, seed) % 4); // 4..7
    const ox1 = hash2(31, 32, seed) % spacing;
    const oy1 = hash2(41, 42, seed) % spacing;

    let ox2 = hash2(33, 34, seed) % spacing;
    let oy2 = hash2(43, 44, seed) % spacing;
    if (ox2 === ox1) ox2 = (ox2 + 1) % spacing;
    if (oy2 === oy1) oy2 = (oy2 + 1) % spacing;

    const edgeWidth = lerp(0.03, 0.07, hash01(51, 52, seed));
    const tHaldi = lerp(0.82, 0.89, hash01(61, 62, seed));
    const tCream = lerp(0.89, 0.94, hash01(71, 72, seed));
    const latticeMix = lerp(0.35, 0.70, hash01(81, 82, seed));

    return {
      seed, mode, f1, f2, f3, phase, petals, twist,
      spacing, ox1, oy1, ox2, oy2,
      edgeWidth, tHaldi, tCream,
      latticeMix
    };
  }

  function fieldValue(mode, dx, dy, r, th, p) {
    switch (mode) {
      case 'Rosette Dots':
        return Math.sin(r * p.f1 + p.phase) + 0.95 * Math.cos(th * p.petals + p.phase * 0.7);
      case 'Diamond Dots':
        return Math.sin((dx + dy) * p.f1 + p.phase) + 0.55 * Math.sin(dx * p.f2 + p.phase * 1.1) - 0.40 * Math.cos(dy * p.f3 + p.phase * 0.9);
      case 'Weave Dots':
        return Math.sin(dx * p.f1 + p.phase) + Math.sin(dy * p.f2 + p.phase * 0.8) + 0.55 * Math.sin((dx - dy) * p.f3 + p.phase * 1.2);
      case 'Scallop Dots':
        return Math.cos(dx * p.f1 + p.phase) * Math.cos(dy * p.f1 + p.phase) + 0.9 * Math.sin(r * p.f3 + p.phase * 0.6);
      case 'Petal Dots':
        return Math.cos((th + p.twist * r) * p.petals + p.phase) + 0.85 * Math.sin(r * p.f2 + p.phase * 0.4);
      default:
        return Math.sin(r * 0.2 + p.phase);
    }
  }

  function latticeA(dx, dy, p) {
    return ((dx + p.ox1) % p.spacing === 0) && ((dy + p.oy1) % p.spacing === 0);
  }
  function latticeB(dx, dy, p) {
    return ((dx + p.ox2) % p.spacing === 0) && ((dy + p.oy2) % p.spacing === 0);
  }

  function dotColor(dx, dy, n, edge, p) {
    if (edge) return BLACK;
    const u = hash01(dx, dy, p.seed ^ 0xBADC0DE);
    if (n >= p.tCream) return (u < 0.18 ? HALDI : CREAM);
    if (n >= p.tHaldi) return (u < 0.65 ? HALDI : CREAM);
    return null;
  }

  // ===== Pattern buffer =====
  let seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  let params = generateParams(seed);
  let gridColors = null; // Uint32 packed, 0 = empty

  function packHex(hex) {
    const h = hex.replace('#','');
    const v = parseInt(h.length === 3 ? h.split('').map(c=>c+c).join('') : h, 16);
    return (v >>> 0);
  }

  const CREAM_P = packHex(CREAM);
  const HALDI_P = packHex(HALDI);
  const BLACK_P = packHex(BLACK);

  function colorToPacked(c) {
    if (c === CREAM) return CREAM_P;
    if (c === HALDI) return HALDI_P;
    if (c === BLACK) return BLACK_P;
    return packHex(c);
  }

  function packedToCss(p) {
    const s = p.toString(16).padStart(6,'0');
    return '#' + s;
  }

  function setGrid(x, y, packed) {
    gridColors[y * cols() + x] = packed;
  }

  function plot8ToGrid(cx, cy, dx, dy, w, h, packed) {
    const pts = [
      [ cx + dx, cy + dy], [ cx - dx, cy + dy], [ cx + dx, cy - dy], [ cx - dx, cy - dy],
      [ cx + dy, cy + dx], [ cx - dy, cy + dx], [ cx + dy, cy - dx], [ cx - dy, cy - dx],
    ];
    const seen = new Set();
    for (const [x,y] of pts) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const k = x + ',' + y;
      if (seen.has(k)) continue;
      seen.add(k);
      setGrid(x, y, packed);
    }
  }

  function stampPaletteSignature(cx, cy, w, h, p) {
    const s = p.spacing;
    const a = 1 + (hash2(101, 102, p.seed) % 2);
    const b = 1 + (hash2(103, 104, p.seed) % 2);

    const dxC = Math.max(2, s - 1), dyC = 0;
    const dxH = Math.max(2, s),     dyH = Math.min(dxH, a);
    const dxB = Math.max(2, s + 1), dyB = Math.min(dxB, b);

    plot8ToGrid(cx, cy, dxC, dyC, w, h, CREAM_P);
    plot8ToGrid(cx, cy, dxH, dyH, w, h, HALDI_P);
    plot8ToGrid(cx, cy, dxB, dyB, w, h, BLACK_P);
  }

  function rebuildPattern() {
    const w = cols();
    const h = rows();
    if (w <= 0 || h <= 0) return;

    params = generateParams(seed);
    gridColors = new Uint32Array(w * h);

    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    const maxDx = Math.max(cx, w - 1 - cx);
    const maxDy = Math.max(cy, h - 1 - cy);
    const maxR = Math.sqrt(maxDx*maxDx + maxDy*maxDy) || 1;

    for (let dx = 0; dx <= Math.max(maxDx, maxDy); dx++) {
      for (let dy = 0; dy <= dx; dy++) {
        const r = Math.sqrt(dx*dx + dy*dy);
        const th = Math.atan2(dy, dx + 1e-6);

        const v = fieldValue(params.mode, dx, dy, r, th, params);
        const n = 0.5 + 0.5 * Math.tanh(v * 0.95);
        const edge = Math.abs(Math.sin(v)) < params.edgeWidth;

        const a = latticeA(dx, dy, params);
        const b = latticeB(dx, dy, params);
        const mixGate = hash01(dx, dy, params.seed ^ 0x13579BDF) < params.latticeMix;
        const onLattice = a || (b && mixGate);

        const edgeGate = ((dx + dy + (params.seed & 7)) % 3) === 0;
        if (!onLattice && !(edge && edgeGate)) continue;

        const cssColor = dotColor(dx, dy, n, edge, params);
        if (!cssColor) continue;

        const edgeFade = (r / maxR);
        if (edgeFade > 0.965 && !edge) continue;

        plot8ToGrid(cx, cy, dx, dy, w, h, colorToPacked(cssColor));
      }
    }

    stampPaletteSignature(cx, cy, w, h, params);
  }

  // ===== Audio (hybrid bloom → beat) =====
  let audioCtx = null;
  let analyser = null;
  let freqData = null;
  let started = false;

  // Bloom state
  let bloomR = 0;
  let bloomTarget = 0;
  let fullnessEma = 0;
  let fullnessMax = 0.08;

  // Beat-mode gate (turn on when the track is "full", off when it drops)
  let beatMode = false;
  let fullHighSince = 0;
  let fullLowSince = 0;

  const BEAT_MODE_ON = 0.78;
  const BEAT_MODE_OFF = 0.55;
  const BEAT_MODE_ON_MS = 1200;
  const BEAT_MODE_OFF_MS = 900;

  // Beat detector (moderate, not trigger-happy)
  let prevBeatE = 0;
  let emaBeatD = 0;
  let emvBeatD = 0;
  let lastBeatAt = 0;

  const BEAT_COOLDOWN_MS = 240;
  const BEAT_ALPHA = 0.12;
  const BEAT_K = 1.10;
  const BEAT_BIAS = 3.2;
  const BEAT_MIN_DELTA = 7;

  function initAudioGraph() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaElementSource(audioEl);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;

    src.connect(analyser);
    analyser.connect(audioCtx.destination);

    freqData = new Uint8Array(analyser.frequencyBinCount);
  }

  function bandAvg(lo, hi) {
    lo = Math.max(0, lo);
    hi = Math.min(freqData.length - 1, hi);
    if (hi < lo) return 0;
    let sum = 0;
    const n = hi - lo + 1;
    for (let i = lo; i <= hi; i++) sum += freqData[i];
    return sum / n;
  }

  function analyzeAudio() {
    analyser.getByteFrequencyData(freqData);

    // Fullness bands
    const low  = bandAvg(0, 24);
    const mid  = bandAvg(25, 110);
    const high = bandAvg(111, 260);

    const raw = (0.50 * low + 0.35 * mid + 0.15 * high) / 255;
    fullnessEma += 0.10 * (raw - fullnessEma);

    fullnessMax = Math.max(fullnessEma, fullnessMax * 0.995);
    const f = Math.min(1, fullnessEma / Math.max(0.06, fullnessMax));

    // Beat energy: kick-ish low + a bit of snare-ish mid
    const midDrums = bandAvg(25, 90);
    const beatE = 0.72 * low + 0.28 * midDrums;

    return { f, beatE };
  }

  function updateBeatMode(f, now) {
    if (!beatMode) {
      if (f > BEAT_MODE_ON) {
        if (!fullHighSince) fullHighSince = now;
        if (now - fullHighSince > BEAT_MODE_ON_MS) {
          beatMode = true;
          fullLowSince = 0;
        }
      } else {
        fullHighSince = 0;
      }
    } else {
      if (f < BEAT_MODE_OFF) {
        if (!fullLowSince) fullLowSince = now;
        if (now - fullLowSince > BEAT_MODE_OFF_MS) {
          beatMode = false;
          fullHighSince = 0;
        }
      } else {
        fullLowSince = 0;
      }
    }
  }

  function detectBeat(beatE, now) {
    const d = Math.max(0, beatE - prevBeatE);
    prevBeatE = beatE;

    const diff = d - emaBeatD;
    emaBeatD += BEAT_ALPHA * diff;
    emvBeatD += BEAT_ALPHA * (diff * diff - emvBeatD);

    const std = Math.sqrt(Math.max(0, emvBeatD));
    const threshold = emaBeatD + BEAT_K * std + BEAT_BIAS;

    if ((now - lastBeatAt) < BEAT_COOLDOWN_MS) return false;
    if (d < BEAT_MIN_DELTA) return false;

    if (d > threshold) {
      lastBeatAt = now;
      return true;
    }
    return false;
  }

  function resetAudioState() {
    fullnessEma = 0;
    fullnessMax = 0.08;
    bloomR = 0;
    bloomTarget = 0;

    beatMode = false;
    fullHighSince = 0;
    fullLowSince = 0;

    prevBeatE = 0;
    emaBeatD = 0;
    emvBeatD = 0;
    lastBeatAt = 0;
  }

  let rafId = null;

  function renderFrame() {
    clear();

    const w = cols();
    const h = rows();
    if (!gridColors || w === 0 || h === 0) {
      rafId = requestAnimationFrame(renderFrame);
      return;
    }

    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);
    const maxDx = Math.max(cx, w - 1 - cx);
    const maxDy = Math.max(cy, h - 1 - cy);
    const maxR = Math.sqrt(maxDx*maxDx + maxDy*maxDy) || 1;

    if (started && analyser && !audioEl.paused) {
      const now = performance.now();
      const { f, beatE } = analyzeAudio();

      updateBeatMode(f, now);

      if (!beatMode) {
        // Bloom phase: grow/shrink by fullness
        const minR = 0.12 * maxR;
        const maxRR = 1.02 * maxR;
        bloomTarget = lerp(minR, maxRR, f);
      } else {
        // Full swing: keep it mostly full-screen and change pattern on beat
        bloomTarget = maxR * (0.94 + 0.08 * f); // small breathing
        if (detectBeat(beatE, now)) {
          newPattern();
        }
      }
    }

    // Ease radius
    bloomR += 0.08 * (bloomTarget - bloomR);
    const r2 = bloomR * bloomR;

    // Draw only tiles within radius
    for (let y = 0; y < h; y++) {
      const dy = y - cy;
      for (let x = 0; x < w; x++) {
        const packed = gridColors[y * w + x];
        if (packed === 0) continue;
        const dx = x - cx;
        if ((dx*dx + dy*dy) > r2) continue;
        drawTile(x, y, packedToCss(packed));
      }
    }

    rafId = requestAnimationFrame(renderFrame);
  }

  function newPattern() {
    seed = (seed + 0x9E3779B9) >>> 0;
    rebuildPattern();
  }

  async function togglePlay() {
    if (!started) {
      initAudioGraph();
      started = true;
    }

    if (audioCtx && audioCtx.state !== 'running') {
      await audioCtx.resume();
    }

    if (audioEl.paused) {
      try {
        await audioEl.play();
      } catch (err) {
        console.warn('Audio play blocked:', err);
        return;
      }

      resetAudioState();

      // Start small, then bloom
      const w = cols(), h = rows();
      const cx = Math.floor(w / 2);
      const cy = Math.floor(h / 2);
      const maxDx = Math.max(cx, w - 1 - cx);
      const maxDy = Math.max(cy, h - 1 - cy);
      const maxR = Math.sqrt(maxDx*maxDx + maxDy*maxDy) || 1;

      bloomR = 0.10 * maxR;
      bloomTarget = bloomR;
    } else {
      audioEl.pause();
    }
  }

  // Boot
  validateColors();
  validateAudio();

  recomputeGrid();
  rebuildPattern();
  clear();

  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(renderFrame);

  window.addEventListener('resize', () => resize());

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    }
    // Optional: press N for a new pattern
    if (e.key && e.key.toLowerCase() === 'n') {
      newPattern();
    }
  });

  window.addEventListener('pointerdown', () => togglePlay());

  // Ensure initial sizing
  resize();
})();
