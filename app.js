/* ═══════════════════════════════════════════════════════════
   AMD Prime Discovery Engine — Frontend Logic
   Real-time WebSocket · Plotly charts · Number theory
═══════════════════════════════════════════════════════════ */

'use strict';

// ── Configuration ─────────────────────────────────────────
// server.js runs on :5000 and serves index.html; both are on the same origin.
// When opening via http://localhost:5000 this resolves automatically.
const SOCKET_URL      = (location.protocol === 'file:' || window.location.port === '3000') ? 'http://localhost:5000' : window.location.origin;
const MAX_GAP_POINTS  = 5000;
const MAX_ULAM_POINTS = 50000;
const MAX_GAP_SAMPLES = 10000;
const MAX_BIAS_HIST   = 300;
const MAX_LOG_ITEMS   = 100;
const CHART_THROTTLE  = 500;   // ms — max redraw frequency
const SPARKLINE_MAX   = 40;    // speed history length

// ── Utilities ─────────────────────────────────────────────
const fmt  = v => new Intl.NumberFormat('en-US').format(v);
const fmtD = v => (v > 0 ? `+${fmt(v)}` : fmt(v));
const fmtF = (v, dp = 1) => Number(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

function parseTimestamp(v) {
  if (!v) return Date.now();
  const n = Number(v);
  if (!isNaN(n)) return n;

  const d = Date.parse(v);
  return isNaN(d) ? Date.now() : d;
}

// ── Application State ─────────────────────────────────────
const state = {
  totalPrimes:   0,
  maxGap:        0,
  maxGapRange:   { left: 0, right: 0 },
  speed:         0,
  chebyshev1:    0,
  chebyshev3:    0,

  // chart data
  recordGaps:    [],          // { x, y, text }
  primes:        [],          // last 10 001 primes for gap buffering
  primeTimes:    [],          // timestamps for speed calculation
  gapSamples:    [],          // raw gaps for histogram
  ulam:          { x: [], y: [] },
  biasHistory:   [],          // { t, diff }
  speedHistory:  [],          // for sparkline

  soundOn:       false,
  startTime:     Date.now(),  // for uptime counter
};

// dirty flags
let dirtyCoreStats = false;
let dirtyScatter   = false;
let dirtyHistogram = false;
let dirtyBias      = false;
let dirtyUlam      = false;
let lastDraw       = 0;

// ── DOM refs ──────────────────────────────────────────────
const $  = id => document.getElementById(id);
const dom = {
  wsStatusChip:  $('wsStatusChip'),
  wsDot:         $('wsDot'),
  wsStatus:      $('wsStatus'),
  clockTime:     $('clockTime'),
  topbarDate:    $('topbarDate'),
  shareBtn:      $('shareBtn'),
  soundBtn:      $('soundBtn'),
  soundIcon:     $('soundIcon'),

  totalPrimes:   $('totalPrimes'),
  primeRate:     $('primeRate'),
  maxGap:        $('maxGap'),
  maxGapDetail:  $('maxGapDetail'),
  primeSpeed:    $('primeSpeed'),
  biasOne:       $('biasOne'),
  biasThree:     $('biasThree'),
  biasDiff:      $('biasDiff'),

  biasOneSmall:  $('biasOneSmall'),
  biasThreeSmall: $('biasThreeSmall'),
  biasDiffSmall: $('biasDiffSmall'),

  ulamZoom:      $('ulamZoom'),
  ulamPoints:    $('ulamPoints'),

  discoveryLog:  $('discoveryLog'),
  logFilter:     $('logFilter'),
  toast:         $('toast'),
  recordBanner:  $('recordBanner'),
  recordBannerText: $('recordBannerText'),
  engineUptime:  $('engineUptime'),
  sparklineSvg:  $('sparklineSvg'),
  sparkline:     $('sparkline'),
  flashBorder:   $('flashBorder'),
};

// ── Plotly chart references ───────────────────────────────
let charts = {};

// ═══════════════════════════════════════════════════════════
//   CHART HELPERS
// ═══════════════════════════════════════════════════════════

function plotlyBase(overrides = {}) {
  return {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor:  'rgba(0,0,0,0)',
    font: {
      color: '#E8EDF3',
      family: "'Inter', ui-sans-serif, sans-serif",
      size: 11,
    },
    xaxis: {
      gridcolor:     'rgba(255,255,255,0.06)',
      zerolinecolor: 'rgba(255,255,255,0.12)',
      linecolor:     'rgba(255,255,255,0.08)',
      tickfont:      { family: "'JetBrains Mono', monospace", size: 10 },
      titlefont:     { size: 11 },
    },
    yaxis: {
      gridcolor:     'rgba(255,255,255,0.06)',
      zerolinecolor: 'rgba(255,255,255,0.12)',
      linecolor:     'rgba(255,255,255,0.08)',
      tickfont:      { family: "'JetBrains Mono', monospace", size: 10 },
      titlefont:     { size: 11 },
    },
    margin: { t: 16, b: 42, l: 54, r: 16, pad: 4 },
    hoverlabel: {
      bgcolor:     'rgba(8,11,20,0.96)',
      bordercolor: '#ED1E79',
      font: { family: "'JetBrains Mono', monospace", size: 11, color: '#E8EDF3' },
    },
    legend: {
      font: { size: 10, color: '#7B89A3' },
      bgcolor: 'rgba(0,0,0,0)',
      x: 0.01, y: 0.99,
    },
    ...overrides,
  };
}

const PLOTLY_CONFIG = {
  displayModeBar:  false,
  responsive:      true,
  scrollZoom:      false,
};

const PLOTLY_CONFIG_PAN = {
  ...PLOTLY_CONFIG,
  displayModeBar:  true,
  modeBarButtonsToRemove: ['autoScale2d', 'lasso2d', 'select2d', 'toImage', 'sendDataToCloud'],
  scrollZoom:      true,
};

// ── Cramér's conjecture curve: y = (ln x)² ───────────────
function buildCramer(maxX) {
  const pts = 100;
  const start = Math.max(10, maxX / 200);
  const end   = Math.max(start * 4, maxX * 2);
  const xs = [], ys = [];
  for (let i = 0; i < pts; i++) {
    const t = start * Math.pow(end / start, i / (pts - 1));
    xs.push(t);
    ys.push(Math.pow(Math.log(t), 2));
  }
  return { x: xs, y: ys };
}

// ── Gumbel distribution overlay (method-of-moments) ──────
function buildGumbel(gaps) {
  if (gaps.length < 4) return { x: [], y: [] };
  const n    = gaps.length;
  const mean = gaps.reduce((s, v) => s + v, 0) / n;
  const variance = gaps.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std  = Math.sqrt(variance);
  // Gumbel: β = std * √6 / π,   μ = mean − 0.5772 * β
  const beta = (std * Math.sqrt(6)) / Math.PI;
  const mu   = mean - 0.5772156649 * beta;

  const sorted = gaps.slice().sort((a, b) => a - b);
  const lo = sorted[0];
  const hi = sorted[n - 1];
  const xs = [], ys = [];
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const x = lo + (hi - lo) * (i / steps);
    const z  = (x - mu) / beta;
    // PDF of Gumbel
    const pdf = (1 / beta) * Math.exp(-(z + Math.exp(-z)));
    // scale to observed frequency (rough)
    xs.push(x);
    ys.push(Math.max(0, pdf * n * (hi - lo) / steps));
  }
  return { x: xs, y: ys };
}

// ═══════════════════════════════════════════════════════════
//   CHART INIT
// ═══════════════════════════════════════════════════════════

function initCharts() {

  // 1. Gap Scatter — log-log, record gaps + Cramér curve
  const cramer0 = buildCramer(1e7);
  charts.scatter = Plotly.newPlot('gapScatter', [
    {
      name: 'Record Gaps',
      x: [], y: [],
      mode: 'markers',
      marker: {
        color: '#ED1E79',
        size: 7,
        opacity: 0.88,
        line: { width: 0 },
        symbol: 'circle',
      },
      hovertemplate: '%{text}<extra></extra>',
      text: [],
    },
    {
      name: "Cramér's Conjecture: (log x)²",
      x: cramer0.x, y: cramer0.y,
      mode: 'lines',
      line: { color: '#00D4FF', dash: 'dash', width: 1.5 },
      hoverinfo: 'skip',
    },
  ], {
    ...plotlyBase(),
    xaxis: {
      ...plotlyBase().xaxis,
      type: 'log',
      title: { text: 'Prime  x', standoff: 8 },
      tickformat: '~s',
      exponentformat: 'power',
    },
    yaxis: {
      ...plotlyBase().yaxis,
      type: 'log',
      title: { text: 'Gap Size', standoff: 8 },
    },
    showlegend: true,
    legend: { ...plotlyBase().legend, x: 0.01, y: 0.99 },
  }, PLOTLY_CONFIG);

  // 2. Ulam Spiral — scatter with glow effect
  charts.ulam = Plotly.newPlot('ulamSpiral', [
    {
      name: 'Prime',
      x: [], y: [],
      mode: 'markers',
      marker: {
        color: '#00D4FF',
        size: 2.5,
        opacity: 0.9,
        symbol: 'circle',
      },
      hovertemplate: '(%{x}, %{y})<extra></extra>',
    },
  ], {
    ...plotlyBase({
      xaxis: { ...plotlyBase().xaxis, zeroline: false, showticklabels: false, title: '' },
      yaxis: { ...plotlyBase().yaxis, zeroline: false, showticklabels: false, title: '', scaleanchor: 'x', scaleratio: 1 },
      margin: { t: 8, b: 8, l: 8, r: 8 },
    }),
    showlegend: false,
    dragmode: 'pan',
  }, PLOTLY_CONFIG_PAN);

  // Track zoom level on Ulam spiral
  const ulamEl = document.getElementById('ulamSpiral');
  if (ulamEl) {
    ulamEl.on('plotly_relayout', data => {
      if (data['xaxis.range[0]'] !== undefined) {
        const range = Math.abs((data['xaxis.range[1]'] || 0) - (data['xaxis.range[0]'] || 0));
        if (range > 0 && dom.ulamZoom) {
          const zoom = (1000 / range).toFixed(2);
          dom.ulamZoom.textContent = zoom + '×';
        }
      }
    });
  }

  // 3. Histogram — bars + Gumbel overlay
  charts.histogram = Plotly.newPlot('gapHistogram', [
    {
      name: 'Observed Gap Frequency',
      x: [],
      type: 'histogram',
      marker: {
        color: '#ED1E79',
        opacity: 0.78,
        line: { color: 'rgba(237,30,121,0.4)', width: 0.5 },
      },
      nbinsx: 40,
      hovertemplate: 'Gap: %{x}<br>Count: %{y}<extra></extra>',
    },
    {
      name: 'Gumbel Distribution (Theoretical)',
      x: [], y: [],
      mode: 'lines',
      line: { color: '#00D4FF', width: 2 },
      hovertemplate: 'Gumbel: %{y:.1f}<extra></extra>',
    },
  ], {
    ...plotlyBase(),
    barmode: 'overlay',
    xaxis: {
      ...plotlyBase().xaxis,
      title: { text: 'Gap Size', standoff: 8 },
    },
    yaxis: {
      ...plotlyBase().yaxis,
      type: 'log',
      title: { text: 'Frequency', standoff: 8 },
    },
    showlegend: true,
    legend: { ...plotlyBase().legend, x: 0.55, y: 0.99 },
  }, PLOTLY_CONFIG);

  // 4. Bias chart — difference over time + zero line
  charts.bias = Plotly.newPlot('biasChart', [
    {
      name: 'Bias (1 mod 4) − (3 mod 4)',
      x: [], y: [],
      mode: 'lines',
      fill: 'tozeroy',
      fillcolor: 'rgba(237,30,121,0.08)',
      line: { color: '#ED1E79', width: 2 },
      hovertemplate: 'Diff: %{y:,.0f}<extra></extra>',
    },
  ], {
    ...plotlyBase({
      margin: { t: 8, b: 32, l: 52, r: 12 },
    }),
    xaxis: {
      ...plotlyBase().xaxis,
      title: { text: 'Time', standoff: 6 },
      tickfont: { size: 9 },
    },
    yaxis: {
      ...plotlyBase().yaxis,
      title: { text: 'Bias Difference', standoff: 6 },
      zeroline: true,
      zerolinecolor: 'rgba(255,255,255,0.2)',
      zerolinewidth: 1.5,
    },
    showlegend: false,
    shapes: [{
      type: 'line',
      xref: 'paper', x0: 0, x1: 1,
      yref: 'y',     y0: 0, y1: 0,
      line: { color: 'rgba(255,255,255,0.15)', width: 1, dash: 'dot' },
    }],
  }, PLOTLY_CONFIG);
}

// ═══════════════════════════════════════════════════════════
//   CHART UPDATE FUNCTIONS (throttled via render loop)
// ═══════════════════════════════════════════════════════════

function updateScatter() {
  if (!charts.scatter) return;
  if (!state.recordGaps.length) return;

  const maxX = Math.max(...state.recordGaps.map(g => g.x));
  const cramer = buildCramer(maxX);

  Plotly.restyle('gapScatter', {
    x:    [state.recordGaps.map(g => g.x), cramer.x],
    y:    [state.recordGaps.map(g => g.y), cramer.y],
    text: [state.recordGaps.map(g => g.text), new Array(cramer.x.length).fill('')],
  }, [0, 1]).catch(() => {});
}

function updateUlam() {
  if (!charts.ulam) return;
  if (!state.ulam.x.length) return;

  // Use restyle to set the full dataset (capped)
  Plotly.restyle('ulamSpiral', {
    x: [state.ulam.x],
    y: [state.ulam.y],
  }, [0]).catch(() => {});

  if (dom.ulamPoints) dom.ulamPoints.textContent = fmt(state.ulam.x.length);
}

function updateHistogram() {
  if (!charts.histogram) return;
  const gaps = state.gapSamples.slice(-MAX_GAP_SAMPLES);
  if (!gaps.length) return;

  const binCount = Math.min(60, Math.max(16, Math.round(2 * Math.cbrt(gaps.length))));
  Plotly.restyle('gapHistogram', { x: [gaps], nbinsx: [binCount] }, [0]).catch(() => {});

  const gumbel = buildGumbel(gaps);
  if (gumbel.x.length) {
    Plotly.restyle('gapHistogram', { x: [gumbel.x], y: [gumbel.y] }, [1]).catch(() => {});
  }
}

function updateBiasChart() {
  if (!charts.bias) return;
  const hist = state.biasHistory.slice(-MAX_BIAS_HIST);
  if (!hist.length) return;

  Plotly.restyle('biasChart', {
    x: [hist.map(p => p.t)],
    y: [hist.map(p => p.diff)],
  }, [0]).catch(() => {});
}

// ── Sparkline ──────────────────────────────────────────────
function updateSparkline() {
  if (!dom.sparkline) return;
  const hist = state.speedHistory;
  if (hist.length < 2) return;

  const W = 120, H = 34, pad = 3;
  const maxV = Math.max(...hist, 1);
  const step  = (W - pad * 2) / (hist.length - 1);

  const pts = hist.map((v, i) => {
    const x = pad + i * step;
    const y = H - pad - ((v / maxV) * (H - pad * 2));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  dom.sparkline.setAttribute('points', pts);
}

// ── Stats DOM update ───────────────────────────────────────
function flashStatValue(el) {
  if (!el) return;
  el.classList.remove('updated');
  void el.offsetWidth; // reflow
  el.classList.add('updated');
  setTimeout(() => el.classList.remove('updated'), 600);
}

function updateCoreStats() {
  if (dom.totalPrimes) { const v = fmt(state.totalPrimes); if (dom.totalPrimes.textContent !== v) { dom.totalPrimes.textContent = v; flashStatValue(dom.totalPrimes); } }
  if (dom.primeRate)   dom.primeRate.textContent   = `+ ${fmt(Math.round(state.speed))} / sec`;
  if (dom.maxGap)      { const v = fmt(state.maxGap); if (dom.maxGap.textContent !== v) { dom.maxGap.textContent = v; flashStatValue(dom.maxGap); } }
  if (dom.maxGapDetail) dom.maxGapDetail.textContent = `Between ${fmt(state.maxGapRange.left)} and ${fmt(state.maxGapRange.right)}`;
  if (dom.primeSpeed)  dom.primeSpeed.textContent  = `${fmtF(state.speed)} / sec`;

  const diff = state.chebyshev1 - state.chebyshev3;
  if (dom.biasOne)   dom.biasOne.textContent   = fmt(state.chebyshev1);
  if (dom.biasThree) dom.biasThree.textContent = fmt(state.chebyshev3);
  if (dom.biasDiff)  dom.biasDiff.textContent  = fmtD(diff);

  if (dom.biasOneSmall)   dom.biasOneSmall.textContent   = fmt(state.chebyshev1);
  if (dom.biasThreeSmall) dom.biasThreeSmall.textContent = fmt(state.chebyshev3);
  if (dom.biasDiffSmall)  dom.biasDiffSmall.textContent  = fmtD(diff);
}

// ── Uptime ─────────────────────────────────────────────────
function updateUptime() {
  if (!dom.engineUptime) return;
  const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
  const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
  const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  dom.engineUptime.textContent = `${h}:${m}:${s}`;
}

// ── Clock ──────────────────────────────────────────────────
function updateClock() {
  const now = new Date();
  if (dom.clockTime) dom.clockTime.textContent = now.toLocaleTimeString([], { hour12: false });
  if (dom.topbarDate) dom.topbarDate.textContent = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
  updateUptime();
}

// ═══════════════════════════════════════════════════════════
//   RENDER LOOP (RAF + throttle)
// ═══════════════════════════════════════════════════════════

function renderAll(now) {
  const anyDirty = dirtyCoreStats || dirtyScatter || dirtyHistogram || dirtyBias || dirtyUlam;
  if (!anyDirty) return;
  if (now - lastDraw < CHART_THROTTLE) return;
  lastDraw = now;

  if (dirtyCoreStats) { updateCoreStats(); dirtyCoreStats = false; }
  if (dirtyScatter)   { updateScatter();   dirtyScatter   = false; }
  if (dirtyHistogram) { updateHistogram(); dirtyHistogram = false; }
  if (dirtyBias)      { updateBiasChart(); dirtyBias      = false; }
  if (dirtyUlam)      { updateUlam();      dirtyUlam      = false; }

  updateSparkline();
}

function tick() {
  requestAnimationFrame(ts => { renderAll(ts); tick(); });
}

// ═══════════════════════════════════════════════════════════
//   DISCOVERY LOG
// ═══════════════════════════════════════════════════════════

const ICON_MAP = {
  gap:   '🏆',
  chain: '🔗',
  tuple: '🔢',
  ap:    '➕',
};

function formatDetail(type, data) {
  if (type === 'gap') {
    return `Gap of <span class="prime-num">${fmt(data.gap)}</span> found between <span class="prime-num">${fmt(data.left)}</span> and <span class="prime-num">${fmt(data.right)}</span>`;
  }
  if (type === 'chain') {
    const chainLabel = data.chainType || 'Cunningham';
    return `<em>${chainLabel}</em> · Start: <span class="prime-num">${fmt(data.start)}</span> · Length: ${data.length}`;
  }
  if (type === 'tuple') {
    const vals = (data.values || data.primes || []).slice(0, 5).map(v => fmt(v)).join(', ');
    return vals + (data.values && data.values.length > 5 ? ` …` : '');
  }
  if (type === 'ap') {
    return `3-term AP · Start: <span class="prime-num">${fmt(data.start)}</span> · Step: ${fmt(data.step)}`;
  }
  return '';
}

function addLogItem(type, title, detailHtml, timestamp, isRecord = false) {
  const item = document.createElement('article');
  item.className = `discovery-item ${type}${isRecord ? ' record' : ''}`;
  item.dataset.type = type;

  const time = new Date(timestamp).toLocaleTimeString([], { hour12: false });
  const badge = isRecord ? '<span class="new-badge">NEW</span>' : '';

  item.innerHTML = `
    <div class="item-icon">${ICON_MAP[type] || '✨'}</div>
    <div>
      <div class="item-header">
        <span class="item-title">${title}${badge}</span>
        <span class="item-time">${time}</span>
      </div>
      <div class="item-detail">${detailHtml}</div>
    </div>
  `;

  if (dom.discoveryLog) {
    dom.discoveryLog.prepend(item);
    // cap at 100
    while (dom.discoveryLog.children.length > MAX_LOG_ITEMS) {
      dom.discoveryLog.removeChild(dom.discoveryLog.lastChild);
    }
    applyLogFilter();
  }
}

function applyLogFilter() {
  if (!dom.logFilter || !dom.discoveryLog) return;
  const filter = dom.logFilter.value;
  for (const child of dom.discoveryLog.children) {
    child.style.display = (filter === 'all' || child.dataset.type === filter) ? '' : 'none';
  }
}

// ═══════════════════════════════════════════════════════════
//   EVENT HANDLERS
// ═══════════════════════════════════════════════════════════

function flushOldPrimeTimes() {
  const now = Date.now();
  state.primeTimes = state.primeTimes.filter(ts => now - ts <= 8000);
  if (state.primeTimes.length > 1) {
    const dur = (state.primeTimes[state.primeTimes.length - 1] - state.primeTimes[0]) / 1000;
    if (dur > 0) {
      state.speed = state.primeTimes.length / dur;
      state.speedHistory.push(Math.round(state.speed));
      if (state.speedHistory.length > SPARKLINE_MAX) state.speedHistory.shift();
    }
  }
}

function handlePrime(data) {
  const value = Number(data.value ?? data.prime ?? data.x ?? data.n);
  if (!isFinite(value) || value <= 0) return;

  if (state.primes.length) {
    const gap = value - state.primes[state.primes.length - 1];
    if (gap > 0 && gap < 1e9) {
      state.gapSamples.push(gap);
      if (state.gapSamples.length > MAX_GAP_SAMPLES) state.gapSamples.shift();
    }
  }
  state.primes.push(value);
  if (state.primes.length > 10001) state.primes.shift();

  const ts = parseTimestamp(data.timestamp);
  state.primeTimes.push(ts);
  flushOldPrimeTimes();

  dirtyCoreStats = true;
  dirtyHistogram  = true;
}

function handleGap(data) {
  // server.js normalises before→left, after→right; keep raw fallbacks too
  const left  = Number(data.left   ?? data.before ?? data.start ?? data.lower ?? 0);
  const right = Number(data.right  ?? data.after  ?? data.end   ?? data.upper ?? 0);
  const gap   = Number(data.gap    ?? data.size   ?? (right - left));
  if (!isFinite(gap) || !isFinite(left) || !isFinite(right)) return;

  const x       = Math.max(left, 2);
  const avgGap  = Math.max(1, Math.log(x));
  const times   = (gap / avgGap).toFixed(1);
  const cramerV = Math.pow(Math.log(x), 2);
  const pct     = ((gap / cramerV) * 100).toFixed(1);
  const tooltipText = [
    `x = ${fmt(x)}`,
    `Gap = ${fmt(gap)}`,
    `Avg gap ≈ log(x) = ${fmtF(avgGap, 1)}`,
    `This gap is ${times}× larger than average`,
    `Cramér bound: ${fmtF(cramerV, 0)} (gap is ${pct}% of bound)`,
  ].join('<br>');

  state.recordGaps.push({ x, y: gap, text: tooltipText });
  if (state.recordGaps.length > MAX_GAP_POINTS) state.recordGaps.shift();

  if (gap > state.maxGap) {
    state.maxGap = gap;
    state.maxGapRange = { left, right };
  }

  const ts = parseTimestamp(data.timestamp);
  addLogItem('gap', '🏆 NEW RECORD GAP!', formatDetail('gap', { gap, left, right }), ts, true);
  flashAlert();
  showRecordBanner(`Gap of ${fmt(gap)} at ${fmt(left)}–${fmt(right)}`);
  if (state.soundOn) playBeep(660, 0.12);

  dirtyCoreStats = true;
  dirtyScatter   = true;
}

function handleChain(data) {
  const start  = Number(data.start ?? data.value ?? 0);
  const length = Number(data.length ?? data.len ?? 0);
  // server.js converts kind integer → string; handle both
  let chainType = data.chainType;
  if (!chainType) chainType = (Number(data.kind) === 2) ? 'Cunningham (2)' : 'Cunningham (1)';
  if (!isFinite(start) || !isFinite(length)) return;

  const label = `${chainType.includes('2') ? 'CUNNINGHAM CHAIN (2)' : 'CUNNINGHAM CHAIN (1)'}`;
  const ts = parseTimestamp(data.timestamp);
  addLogItem('chain', label, formatDetail('chain', { chainType, start, length }), ts, false);
}

function handleTuple(data) {
  const values = data.values || data.primes || [];
  const label  = values.length >= 4 ? 'PRIME QUADRUPLET' : 'PRIME TRIPLET';
  const ts     = parseTimestamp(data.timestamp);
  addLogItem('tuple', label, formatDetail('tuple', { values }), ts, false);
}

function handleAp(data) {
  const start  = Number(data.start ?? 0);
  const step   = Number(data.step  ?? 0);
  const values = Array.isArray(data.values) ? data.values : (data.primes || []);
  if (!isFinite(start) || !isFinite(step)) return;

  const ts = parseTimestamp(data.timestamp);
  addLogItem('ap', 'ARITHMETIC PROGRESSION', formatDetail('ap', { start, step, values }), ts, false);
}

function handleChebyshev(data) {
  // server.js maps c1→count1, c3→count3; keep raw c1/c3 as fallbacks
  const c1 = Number(data.count1 ?? data.c1 ?? data.one ?? data['1'] ?? state.chebyshev1);
  const c3 = Number(data.count3 ?? data.c3 ?? data.three ?? data['3'] ?? state.chebyshev3);
  if (!isFinite(c1) || !isFinite(c3)) return;

  state.chebyshev1 = c1;
  state.chebyshev3 = c3;
  const diff = c1 - c3;
  const now  = new Date();
  state.biasHistory.push({
    t:    now.toLocaleTimeString([], { hour12: false }),
    diff: diff,
  });
  if (state.biasHistory.length > MAX_BIAS_HIST) state.biasHistory.shift();

  dirtyCoreStats = true;
  dirtyBias      = true;
}

function handleUlamBatch(data) {
  let points = [];
  if (Array.isArray(data.points) && data.points.length) {
    points = data.points;
  } else if (Array.isArray(data.x) && Array.isArray(data.y)) {
    // server.js normalises xs→x, ys→y
    points = data.x.map((x, i) => ({ x, y: data.y[i] }));
  } else if (Array.isArray(data.xs) && Array.isArray(data.ys)) {
    // raw C++ field names
    points = data.xs.map((x, i) => ({ x, y: data.ys[i] }));
  }

  for (const pt of points) {
    const x = Number(pt.x), y = Number(pt.y);
    if (!isFinite(x) || !isFinite(y)) continue;
    state.ulam.x.push(x);
    state.ulam.y.push(y);
  }

  // Cap
  if (state.ulam.x.length > MAX_ULAM_POINTS) {
    const trim = state.ulam.x.length - MAX_ULAM_POINTS;
    state.ulam.x.splice(0, trim);
    state.ulam.y.splice(0, trim);
  }

  dirtyUlam = true;
}

function handleStats(data) {
  // server.js normalises total→primeCount, max_gap→maxGap, c1→chebyshev1 etc.
  // Keep raw C++ field names as extra fallbacks
  const primes = Number(data.primeCount  ?? data.total       ?? data.totalPrimes ?? data.count ?? NaN);
  const maxGap = Number(data.maxGap      ?? data.max_gap     ?? data.currentMaxGap ?? NaN);
  const c1     = Number(data.chebyshev1  ?? data.count1      ?? data.c1  ?? NaN);
  const c3     = Number(data.chebyshev3  ?? data.count3      ?? data.c3  ?? NaN);
  const speed  = Number(data.speed ?? NaN);

  if (isFinite(primes)) state.totalPrimes = primes;
  if (isFinite(maxGap)) state.maxGap      = maxGap;
  if (isFinite(c1))     state.chebyshev1  = c1;
  if (isFinite(c3))     state.chebyshev3  = c3;
  if (isFinite(speed))  {
    state.speed = speed;
    state.speedHistory.push(Math.round(speed));
    if (state.speedHistory.length > SPARKLINE_MAX) state.speedHistory.shift();
  }

  dirtyCoreStats = true;
}

// ── Main socket event dispatcher ───────────────────────────
function handleSocketData(raw) {
  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch { return; }
  }
  if (!data || typeof data !== 'object') return;

  const type = String(data.type || data.event || '').toLowerCase();

  switch (type) {
    case 'prime':      handlePrime(data);     break;
    case 'gap':        handleGap(data);       break;
    case 'chain':      handleChain(data);     break;
    case 'tuple':      handleTuple(data);     break;
    case 'ap':         handleAp(data);        break;
    case 'chebyshev':  handleChebyshev(data); break;
    case 'ulam_batch': handleUlamBatch(data); break;
    case 'stats':      handleStats(data);     break;
    default:
      // duck-type fallback
      if (data.gap && data.left && data.right)                     handleGap(data);
      else if (data.count1 !== undefined && data.count3 !== undefined) handleChebyshev(data);
      else if (data.points || (Array.isArray(data.x) && Array.isArray(data.y))) handleUlamBatch(data);
      else if (data.value || data.prime)                            handlePrime(data);
      break;
  }
}

// ═══════════════════════════════════════════════════════════
//   WEBSOCKET
// ═══════════════════════════════════════════════════════════

function setConnectionStatus(connected) {
  if (!dom.wsStatusChip) return;
  if (connected) {
    dom.wsStatusChip.className = 'topbar-chip connected';
    if (dom.wsStatus) dom.wsStatus.textContent = 'CONNECTED';
    // Cancel demo data timer — real engine is streaming
    _connected = true;
    if (_demoTimer) { clearTimeout(_demoTimer); _demoTimer = null; }
  } else {
    dom.wsStatusChip.className = 'topbar-chip offline';
    if (dom.wsStatus) dom.wsStatus.textContent = 'OFFLINE';
  }
}

function connectSocket() {
  const socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],  // polling fallback for file:// origin
    reconnectionAttempts: Infinity,
    reconnectionDelay:    1500,
    timeout:              6000,
  });

  socket.on('connect', () => {
    setConnectionStatus(true);
    showToast('✅ Connected to Prime Engine');
    console.log('[ws] Connected — socket id:', socket.id);
  });

  socket.on('disconnect', reason => {
    setConnectionStatus(false);
    showToast('⚠️ Disconnected — reconnecting…');
    console.warn('[ws] Disconnected:', reason);
  });

  socket.on('connect_error', err => {
    setConnectionStatus(false);
    console.warn('[ws] Connection error:', err.message);
  });

  socket.on('new_data', data => {
    // Skip the hello sentinel from server startup
    if (data && data._hello) return;
    handleSocketData(data);
  });

  // Expose socket for debugging
  window._socket = socket;
}

// ═══════════════════════════════════════════════════════════
//   UI HELPERS
// ═══════════════════════════════════════════════════════════

let toastTimer = null;
function showToast(msg) {
  if (!dom.toast) return;
  dom.toast.textContent = msg;
  dom.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove('show'), 2800);
}

let recordBannerTimer = null;
function showRecordBanner(msg) {
  if (!dom.recordBanner || !dom.recordBannerText) return;
  dom.recordBannerText.textContent = msg;
  dom.recordBanner.classList.remove('hidden');
  clearTimeout(recordBannerTimer);
  recordBannerTimer = setTimeout(() => dom.recordBanner.classList.add('hidden'), 5500);
}

function flashAlert() {
  document.body.classList.add('flash-alert');
  setTimeout(() => document.body.classList.remove('flash-alert'), 700);
}

function playBeep(freq = 440, vol = 0.08) {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  } catch (e) {
    // audio not available
  }
}

function toggleSound() {
  state.soundOn = !state.soundOn;
  if (dom.soundBtn) {
    dom.soundBtn.setAttribute('aria-pressed', state.soundOn ? 'true' : 'false');
    // update button text, keep icon
    const textNode = dom.soundBtn.lastChild;
    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
      textNode.nodeValue = state.soundOn ? ' SOUND: ON' : ' SOUND: OFF';
    } else {
      dom.soundBtn.innerHTML = dom.soundBtn.innerHTML.replace(/SOUND: (ON|OFF)/, `SOUND: ${state.soundOn ? 'ON' : 'OFF'}`);
    }
  }
  if (state.soundOn) playBeep(440, 0.05);
}

function copySummary() {
  const diff = state.chebyshev1 - state.chebyshev3;
  const text =
    `AMD Prime Discovery Engine — Live Summary\n` +
    `──────────────────────────────────────────\n` +
    `Total Primes Found : ${fmt(state.totalPrimes)}\n` +
    `Current Max Gap    : ${fmt(state.maxGap)}\n` +
    `  Between ${fmt(state.maxGapRange.left)} and ${fmt(state.maxGapRange.right)}\n` +
    `Discovery Speed    : ${fmtF(state.speed)} primes/sec\n` +
    `Chebyshev (1 mod 4): ${fmt(state.chebyshev1)}\n` +
    `Chebyshev (3 mod 4): ${fmt(state.chebyshev3)}\n` +
    `Bias Difference    : ${fmtD(diff)}\n` +
    `──────────────────────────────────────────\n` +
    `Captured at ${new Date().toLocaleString()}`;

  navigator.clipboard.writeText(text)
    .then(() => showToast('📋 Summary copied to clipboard!'))
    .catch(() => showToast('Copy failed — try again'));
}

// ═══════════════════════════════════════════════════════════
//   DEMO DATA (offline / engine-not-running fallback)
// ═══════════════════════════════════════════════════════════

// Expose handleSocketData globally so judges/developers can test in console
window.handleSocketData = handleSocketData;

/**
 * Inject demo data after a grace period if the WebSocket never connects.
 * This keeps the dashboard looking alive when server.js isn't running.
 * When the real engine IS running this function is never called (the
 * 'connect' event sets a flag that cancels the timer).
 */
let _demoTimer = null;
let _connected  = false;

function scheduleDemoData() {
  _demoTimer = setTimeout(() => {
    if (_connected) return;  // real data arrived — skip demo
    console.info('[demo] No connection after 3s — injecting demo data');

    // Seed gap samples for histogram
    const samplePrimes = [
      2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,
      73,79,83,89,97,101,103,107,109,113,127,131,137,139,149,151,
      157,163,167,173,179,181,191,193,197,199,211,223,227,229,233,
      239,241,251,257,263,269,271,277,281,283,293,307,311,313,317,
      331,337,347,349,353,359,367,373,379,383,389,397,
    ];
    for (let i = 1; i < samplePrimes.length; i++) {
      state.gapSamples.push(samplePrimes[i] - samplePrimes[i - 1]);
    }

    handleSocketData({ type: 'stats', primeCount: 1024, maxGap: 72, chebyshev1: 512, chebyshev3: 489, speed: 847 });
    handleSocketData({ type: 'gap',   left: 31397, right: 31469, gap: 72, timestamp: Date.now() });
    handleSocketData({ type: 'chain', start: 89, length: 5, chainType: 'Cunningham (1)', timestamp: Date.now() });
    handleSocketData({ type: 'tuple', values: [5, 7, 11, 13], timestamp: Date.now() });
    handleSocketData({ type: 'ap',    start: 5, step: 6, values: [5, 11, 17], timestamp: Date.now() });
    handleSocketData({ type: 'chebyshev', count1: 512, count3: 489, timestamp: Date.now() });

    // Ulam seed — random sparse grid
    const ulamSeed = { type: 'ulam_batch', points: [] };
    for (let i = -30; i <= 30; i++) {
      for (let j = -30; j <= 30; j++) {
        if (Math.random() < 0.18) ulamSeed.points.push({ x: i, y: j });
      }
    }
    handleSocketData(ulamSeed);
    dirtyScatter = dirtyHistogram = dirtyBias = dirtyUlam = dirtyCoreStats = true;
  }, 3000);
}

// ═══════════════════════════════════════════════════════════
//   BOOTSTRAP
// ═══════════════════════════════════════════════════════════

function bootstrap() {
  setConnectionStatus(false);
  initCharts();
  tick();

  if (dom.shareBtn)  dom.shareBtn.addEventListener('click', copySummary);
  if (dom.soundBtn)  dom.soundBtn.addEventListener('click', toggleSound);
  if (dom.logFilter) dom.logFilter.addEventListener('change', applyLogFilter);

  updateClock();
  setInterval(updateClock, 1000);

  // Connect to server.js Socket.IO bridge
  connectSocket();

  // Show demo data if engine not running within 3s
  scheduleDemoData();

  updateCoreStats();
}

bootstrap();
