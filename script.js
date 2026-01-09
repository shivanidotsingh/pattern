(() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const audioEl = document.getElementById('track');

  const TILE = 20;

  const CSS = getComputedStyle(document.documentElement);
  const BG     = CSS.getPropertyValue('--bg').trim()     || '#6b0f1a';
  const CREAM  = CSS.getPropertyValue('--cream').trim()  || '#f3e7d3';
  const HALDI  = CSS.getPropertyValue('--haldi').trim()  || '#f2b705';
  const BLACK  = CSS.getPropertyValue('--black').trim()  || '#140f12';

  // --- Minimal tests (fail loudly instead of a blank screen) ---
  function assert(cond, msg){ if(!cond) throw new Error(msg); }
  function validateColors(){
    const ok = c => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c);
    assert(ok(BG) && ok(CREAM) && ok(HALDI) && ok(BLACK), 'One of the CSS colors is not a hex value.');
  }
  function validateAudio(){
    assert(audioEl instanceof HTMLAudioElement, 'Audio element not found.');
  }

  function resize() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  function cols() { return Math.floor(window.innerWidth / TILE); }
  function rows() { return Math.floor(window.innerHeight / TILE); }

  function clear() {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  }

  function drawTile(gx, gy, color) {
    ctx.fillStyle = color;
    ctx.fillRect(gx * TILE, gy * TILE, TILE, TILE);
  }

  // 32-bit mixing hash: deterministic "random" based on (a,b,seed)
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

  // Iterate all 8 symmetric positions for a given (dx,dy) around center
  function plot8(cx, cy, dx, dy, w, h, color) {
    const pts = [
      [ cx + dx, cy + dy], [ cx - dx, cy + dy], [ cx + dx, cy - dy], [ cx - dx, cy - dy],
      [ cx + dy, cy + dx], [ cx - dy, cy + dx], [ cx + dy, cy - dx], [ cx - dy, cy - dx],
    ];
    const seen = new Set();
    for (const [x,y] of pts) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const key = x + ',' + y;
      if (seen.has(key)) continue;
      seen.add(key);
      drawTile(x, y, color);
    }
  }

  // --- Modes (math fields) ---
  const MODES = [
    'Rosette Dots',
    'Diamond Dots',
    'Weave Dots',
    'Scallop Dots',
    'Petal Dots'
  ];

  function pick(arr, seed) {
    return arr[hash2(seed, seed ^ 0xA3, 0xC0FFEE) % arr.length];
  }

  function lerp(a,b,t){ return a + (b-a)*t; }

  function generateParams(seed) {
    const mode = pick(MODES, seed);

    // Use hashes to derive stable params
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

    // Base lattice spacing + second lattice for richness
    const spacing = 4 + (hash2(21, 22, seed) % 4); // 4,5,6,7
    const ox1 = hash2(31, 32, seed) % spacing;
    const oy1 = hash2(41, 42, seed) % spacing;

    // second lattice offsets (ensure not identical to first)
    let ox2 = hash2(33, 34, seed) % spacing;
    let oy2 = hash2(43, 44, seed) % spacing;
    if (ox2 === ox1) ox2 = (ox2 + 1) % spacing;
    if (oy2 === oy1) oy2 = (oy2 + 1) % spacing;

    // “Stitch line” width (thin)
    const edgeWidth = lerp(0.03, 0.07, hash01(51, 52, seed));

    // Richer but still dotty
    const tHaldi = lerp(0.82, 0.89, hash01(61, 62, seed));
    const tCream = lerp(0.89, 0.94, hash01(71, 72, seed));

    // How much of the second lattice to enable (0..1)
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

  // Dot lattice masks (perfectly symmetric because they use (dx,dy) in octant coords)
  function latticeA(dx, dy, p) {
    return ((dx + p.ox1) % p.spacing === 0) && ((dy + p.oy1) % p.spacing === 0);
  }
  function latticeB(dx, dy, p) {
    return ((dx + p.ox2) % p.spacing === 0) && ((dy + p.oy2) % p.spacing === 0);
  }

  // Decide dot color deterministically from (dx,dy,seed) and field
  function dotColor(dx, dy, n, edge, p) {
    // black reserved for stitch lines + accents
    if (edge) return BLACK;

    // deterministic "salt" for haldi/cream mix
    const u = hash01(dx, dy, p.seed ^ 0xBADC0DE);

    // in the top band, some dots still go haldi
    if (n >= p.tCream) return (u < 0.18 ? HALDI : CREAM);

    if (n >= p.tHaldi) return (u < 0.65 ? HALDI : CREAM);
    return null;
  }

  // Guarantees all three ink colors are present in EVERY pattern (still perfectly symmetric)
  function stampPaletteSignature(cx, cy, w, h, p) {
    const s = p.spacing;
    const a = 1 + (hash2(101, 102, p.seed) % 2);
    const b = 1 + (hash2(103, 104, p.seed) % 2);

    const dxC = Math.max(2, s - 1);
    const dyC = 0;

    const dxH = Math.max(2, s);
    const dyH = Math.min(dxH, a);

    const dxB = Math.max(2, s + 1);
    const dyB = Math.min(dxB, b);

    plot8(cx, cy, dxC, dyC, w, h, CREAM);
    plot8(cx, cy, dxH, dyH, w, h, HALDI);
    plot8(cx, cy, dxB, dyB, w, h, BLACK);
  }

  function renderWithParams(p) {
    clear();

    const w = cols();
    const h = rows();
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);

    const maxDx = Math.max(cx, w - 1 - cx);
    const maxDy = Math.max(cy, h - 1 - cy);
    const maxR = Math.sqrt(maxDx*maxDx + maxDy*maxDy) || 1;

    // Iterate only the first octant triangle and stamp out 8-way.
    for (let dx = 0; dx <= Math.max(maxDx, maxDy); dx++) {
      for (let dy = 0; dy <= dx; dy++) {
        const r = Math.sqrt(dx*dx + dy*dy);
        const th = Math.atan2(dy, dx + 1e-6);

        const v = fieldValue(p.mode, dx, dy, r, th, p);
        const n = 0.5 + 0.5 * Math.tanh(v * 0.95);

        const edge = Math.abs(Math.sin(v)) < p.edgeWidth;

        const a = latticeA(dx, dy, p);
        const b = latticeB(dx, dy, p);
        const mixGate = hash01(dx, dy, p.seed ^ 0x13579BDF) < p.latticeMix;
        const onLattice = a || (b && mixGate);

        const edgeGate = ((dx + dy + (p.seed & 7)) % 3) === 0;
        if (!onLattice && !(edge && edgeGate)) continue;

        const color = dotColor(dx, dy, n, edge, p);
        if (!color) continue;

        const edgeFade = (r / maxR);
        if (edgeFade > 0.965 && !edge) continue;

        plot8(cx, cy, dx, dy, w, h, color);
      }
    }

    stampPaletteSignature(cx, cy, w, h, p);
  }

  // --- Beat detection + audio wiring ---
  let audioCtx = null;
  let analyser = null;
  let freqData = null;
  let started = false;
  let rafId = null;

  // simple adaptive onset detector
  let ema = 0;            // exponential moving average of energy
  let emv = 0;            // exponential moving variance (approx)
  let lastBeatAt = 0;
  const COOLDOWN_MS = 180;

  function initAudioGraph() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaElementSource(audioEl);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.6;

    src.connect(analyser);
    analyser.connect(audioCtx.destination);

    freqData = new Uint8Array(analyser.frequencyBinCount);
  }

  function bassEnergy() {
    analyser.getByteFrequencyData(freqData);
    let sum = 0;
    const N = Math.min(15, freqData.length);
    for (let i = 0; i < N; i++) sum += freqData[i];
    return sum / N; // 0..255
  }

  function validateGenerator(){
    validateColors();
    validateAudio();
    const p = generateParams(123456789);
    assert(MODES.includes(p.mode), 'generateParams() produced an unknown mode.');
    assert(p.spacing >= 4 && p.spacing <= 7, 'spacing out of expected range.');
    assert(p.tCream > p.tHaldi, 'Thresholds must satisfy tCream > tHaldi.');
    assert(p.latticeMix >= 0 && p.latticeMix <= 1, 'latticeMix out of range.');
  }

  let seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  let params = generateParams(seed);

  function render(){
    params = generateParams(seed);
    renderWithParams(params);
  }

  function next(){
    seed = (seed + 0x9E3779B9) >>> 0;
    render();
  }

  function tick() {
    if (!analyser) return;

    const e = bassEnergy();

    const a = 0.08;
    const diff = e - ema;
    ema += a * diff;
    emv += a * (diff * diff - emv);

    const std = Math.sqrt(Math.max(0, emv));
    const threshold = ema + 1.15 * std + 6;

    const now = performance.now();
    const canTrigger = (now - lastBeatAt) > COOLDOWN_MS;

    if (canTrigger && e > threshold && diff > 0) {
      lastBeatAt = now;
      next();
    }

    rafId = requestAnimationFrame(tick);
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
      ema = 0; emv = 0; lastBeatAt = 0;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(tick);
    } else {
      audioEl.pause();
      cancelAnimationFrame(rafId);
    }
  }

  // boot
  resize();
  validateGenerator();
  render();

  window.addEventListener('resize', () => {
    resize();
    renderWithParams(params);
  });

  // space toggles play/pause
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    }
  });

  // tap/click toggles play/pause
  window.addEventListener('pointerdown', () => togglePlay());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
    } else if (started && !audioEl.paused) {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(tick);
    }
  });
})();
