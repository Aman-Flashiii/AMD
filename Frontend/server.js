/**
 * AMD Prime Discovery Engine — Socket.IO Bridge Server
 *
 * Architecture:
 *   C++ Engine → /tmp/prime_results.json (JSON array, appended live)
 *            ↓
 *   This server tails the file, parses each new JSON object,
 *   normalises field names, and emits 'new_data' events over Socket.IO.
 *            ↓
 *   Browser dashboard (index.html + app.js) receives events in real-time.
 *
 * JSON field normalisation (C++ → frontend):
 *   gap   : before/after → left/right
 *   chain : kind (int) → chainType (string "Cunningham (1)" / "Cunningham (2)")
 *   tuple : start + kind → values array
 *   ap    : start + length → start + step (step inferred from length)
 *   cheby : c1/c3 → count1/count3
 *   stats : total → primeCount, c1/c3 → chebyshev1/chebyshev3, max_gap → maxGap
 *   ulam  : xs/ys arrays → x/y arrays
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const http    = require('http');
const express = require('express');
const cors    = require('cors');
const { Server } = require('socket.io');

// ── Configuration ─────────────────────────────────────────
const PORT            = 5000;
const RESULTS_FILE    = process.env.RESULTS_FILE || path.join(os.tmpdir(), 'prime_results.json');
const POLL_INTERVAL   = 200;   // ms — how often to check for new lines
const SERVE_STATIC    = true;  // also serve index.html from this server

// ── Express + Socket.IO setup ────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

app.use(cors());
app.use(express.json());

// Serve the frontend from the same directory as this file
if (SERVE_STATIC) {
  const frontendDir = __dirname;
  app.use(express.static(frontendDir));
  app.get('/', (req, res) => {
    res.sendFile(path.join(frontendDir, 'index.html'));
  });
}

// Health-check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', clients: io.engine.clientsCount, file: RESULTS_FILE });
});

// ── Field normalisation ───────────────────────────────────

/**
 * Cunningham chain type numbers from C++:
 *   type 1 → "Cunningham (1)"  (each term = 2p+1)
 *   type 2 → "Cunningham (2)"  (each term = 2p−1)
 */
function chainTypeLabel(kind) {
  const k = Number(kind);
  if (k === 2) return 'Cunningham (2)';
  return 'Cunningham (1)';
}

/**
 * Build a plausible values array for a prime tuple.
 * The C++ streamer only sends start + kind (3 = triplet, 4 = quadruplet).
 * We generate the canonical pattern offsets.
 */
function buildTupleValues(start, kind) {
  if (start === undefined || start === null) return [];
  const s = BigInt(Math.trunc(Number(start)));
  const k = Number(kind);
  // Standard prime constellation offsets
  if (k === 4) return [s, s + 2n, s + 6n, s + 8n].map(v => Number(v));
  // triplet — two variants; use (0,2,6) pattern
  return [s, s + 2n, s + 6n].map(v => Number(v));
}

/**
 * Normalise any raw JSON object from the C++ engine into the
 * canonical shape that app.js expects.
 */
function normalise(raw) {
  const type = (raw.type || '').toLowerCase();

  switch (type) {

    case 'prime':
      return {
        type:      'prime',
        value:     raw.value,
        timestamp: raw.timestamp,
      };

    case 'gap':
      return {
        type:      'gap',
        gap:       raw.gap,
        left:      raw.before ?? raw.left  ?? raw.start ?? 0,
        right:     raw.after  ?? raw.right ?? raw.end   ?? 0,
        timestamp: raw.timestamp,
      };

    case 'chain':
      return {
        type:      'chain',
        start:     raw.start,
        length:    raw.length ?? raw.len,
        chainType: chainTypeLabel(raw.kind ?? raw.type_id ?? 1),
        timestamp: raw.timestamp,
      };

    case 'tuple':
      return {
        type:      'tuple',
        // Pass through an already-built values array if present (from /inject or future C++ fields)
        values:    Array.isArray(raw.values) ? raw.values : buildTupleValues(raw.start, raw.kind ?? 3),
        timestamp: raw.timestamp,
      };

    case 'ap': {
      // C++ sends start + length; frontend needs start + step + values
      const apStart = Number(raw.start ?? 0);
      const apStep  = Number(raw.step ?? 2);   // step may not be sent; default 2
      const apLen   = Number(raw.length ?? 3);
      const vals    = [];
      for (let i = 0; i < apLen; i++) vals.push(apStart + i * apStep);
      return {
        type:      'ap',
        start:     apStart,
        step:      apStep,
        values:    vals,
        timestamp: raw.timestamp,
      };
    }

    case 'chebyshev':
      return {
        type:      'chebyshev',
        count1:    raw.c1    ?? raw.count1 ?? raw.one ?? 0,
        count3:    raw.c3    ?? raw.count3 ?? raw.three ?? 0,
        timestamp: raw.timestamp,
      };

    case 'ulam_batch':
      return {
        type:      'ulam_batch',
        // C++ uses xs/ys; frontend expects x/y
        x:         raw.xs ?? raw.x ?? [],
        y:         raw.ys ?? raw.y ?? [],
        timestamp: raw.timestamp,
      };

    case 'stats':
      return {
        type:        'stats',
        primeCount:  raw.total      ?? raw.primeCount  ?? raw.totalPrimes ?? 0,
        chebyshev1:  raw.c1         ?? raw.chebyshev1  ?? raw.count1      ?? 0,
        chebyshev3:  raw.c3         ?? raw.chebyshev3  ?? raw.count3      ?? 0,
        maxGap:      raw.max_gap    ?? raw.maxGap       ?? 0,
        speed:       raw.speed      ?? 0,
        timestamp:   raw.timestamp,
      };

    default:
      // Pass through unknown types unchanged (duck-typing in app.js handles them)
      return raw;
  }
}

// ── File tail ─────────────────────────────────────────────

/**
 * The C++ engine writes a JSON *array* to the file:
 *   [
 *     {"type":"stats",...},
 *     {"type":"gap",...},
 *     ...
 *   ]
 *
 * We use a robust line-by-line strategy: track bytes read so far,
 * read only the new bytes, split on newlines, and parse any line that
 * looks like a JSON object (starts with '{' after stripping commas).
 *
 * This is deliberately tolerant of partial writes and the leading '['
 * or trailing ']' from the C++ streamer.
 */

let bytesRead   = 0;
let leftover    = '';   // incomplete line fragment from last poll
let totalEvents = 0;

function tailFile() {
  if (!fs.existsSync(RESULTS_FILE)) {
    // File doesn't exist yet — engine hasn't started
    return;
  }

  let fd;
  try {
    const stat = fs.statSync(RESULTS_FILE);
    if (stat.size <= bytesRead) return;   // nothing new

    fd = fs.openSync(RESULTS_FILE, 'r');
    const newBytes = stat.size - bytesRead;
    const buf      = Buffer.alloc(newBytes);
    const bytesActuallyRead = fs.readSync(fd, buf, 0, newBytes, bytesRead);
    bytesRead += bytesActuallyRead;

    const chunk = leftover + buf.toString('utf8', 0, bytesActuallyRead);
    const lines = chunk.split('\n');

    // Last element may be incomplete — save as leftover
    leftover = lines.pop() || '';

    for (const rawLine of lines) {
      // Strip commas, spaces, array brackets
      const line = rawLine.trim().replace(/^,/, '').replace(/^\[/, '').replace(/^\]/, '').trim();
      if (!line || !line.startsWith('{')) continue;

      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        // Might be a partial write — skip
        continue;
      }

      const normalised = normalise(obj);
      io.emit('new_data', normalised);
      totalEvents++;
    }
  } catch (err) {
    console.error('[tail] Error reading file:', err.message);
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
    }
  }
}

// ── Socket.IO events ─────────────────────────────────────
io.on('connection', socket => {
  const addr = socket.handshake.address;
  console.log(`[ws] Client connected: ${socket.id} from ${addr}`);
  console.log(`[ws] Total connected: ${io.engine.clientsCount}`);

  // Send an immediate hello so the browser knows we're alive
  socket.emit('new_data', {
    type:       'stats',
    primeCount: 0,
    chebyshev1: 0,
    chebyshev3: 0,
    maxGap:     0,
    speed:      0,
    timestamp:  Date.now(),
    _hello:     true,
  });

  socket.on('disconnect', reason => {
    console.log(`[ws] Client disconnected: ${socket.id} (${reason})`);
  });
});

// ── Manual inject endpoint (for testing without C++ engine) ──
app.post('/inject', (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  const normalised = normalise(payload);
  io.emit('new_data', normalised);
  res.json({ ok: true, emitted: normalised });
});

// ═══════════════════════════════════════════════════════════
//   SIMULATION ENGINE (runs when no C++ results file exists)
// ═══════════════════════════════════════════════════════════

let simInterval  = null;
let simPrime     = 2;
let simPrimePrev = 0;
let simCount     = 0;
let simMaxGap    = 0;
let simC1        = 0;   // primes ≡ 1 (mod 4)
let simC3        = 0;   // primes ≡ 3 (mod 4)
let simUlamBuf   = [];

// Simple deterministic primality test (enough for simulation up to ~10M)
function isPrime(n) {
  if (n < 2) return false;
  if (n < 4) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (let i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
}

// Map a prime index to Ulam spiral (x,y)
function ulamXY(n) {
  if (n <= 0) return { x: 0, y: 0 };
  const k  = Math.ceil((Math.sqrt(n) - 1) / 2);
  const t  = 2 * k + 1;
  const m  = t * t;
  let x = k, y = -k;
  if (n >= m - 7 * k) { x = k - (m - n); y = -k;          }
  else if (n >= m - 5 * k) { x = -k; y = -k + (m - 5 * k - n + 1); }
  else if (n >= m - 3 * k) { x = -k + (m - 3 * k - n + 1); y = k; }
  else                      { x = k; y = k - (m - k - n + 1); }
  return { x, y };
}

function simStep() {
  // Stop simulation the moment the real file appears
  if (fs.existsSync(RESULTS_FILE)) {
    clearInterval(simInterval);
    simInterval = null;
    bytesRead = fs.statSync(RESULTS_FILE).size;
    console.log('[sim] C++ engine file detected — stopping simulator');
    return;
  }

  // Advance to the next ~20 primes per tick (≈100 primes/sec)
  const batchSize = 20;
  const events    = [];

  for (let b = 0; b < batchSize; b++) {
    simPrime++;
    while (!isPrime(simPrime)) simPrime++;

    simCount++;
    const gap = simPrimePrev > 0 ? simPrime - simPrimePrev : 0;

    // Chebyshev bias tracking
    const mod4 = simPrime % 4;
    if (mod4 === 1) simC1++;
    if (mod4 === 3) simC3++;

    // Track max gap
    if (gap > simMaxGap) {
      simMaxGap = gap;
      // Emit a record gap event
      const gapEvt = normalise({
        type:      'gap',
        gap:       gap,
        left:      simPrimePrev,
        right:     simPrime,
        timestamp: Date.now(),
      });
      io.emit('new_data', gapEvt);
    }

    // Ulam spiral
    simUlamBuf.push(ulamXY(simCount));

    simPrimePrev = simPrime;
  }

  // Emit Ulam batch every tick
  if (simUlamBuf.length > 0) {
    io.emit('new_data', normalise({
      type:      'ulam_batch',
      xs:        simUlamBuf.map(p => p.x),
      ys:        simUlamBuf.map(p => p.y),
      timestamp: Date.now(),
    }));
    simUlamBuf = [];
  }

  // Emit stats every tick
  io.emit('new_data', normalise({
    type:       'stats',
    total:      simCount,
    max_gap:    simMaxGap,
    c1:         simC1,
    c3:         simC3,
    speed:      batchSize * (1000 / 200),   // events per tick / tick rate
    timestamp:  Date.now(),
  }));

  // Occasionally emit Chebyshev, chain, tuple, ap events
  if (simCount % 50 === 0) {
    io.emit('new_data', normalise({
      type: 'chebyshev', c1: simC1, c3: simC3, timestamp: Date.now(),
    }));
  }
  if (simCount % 200 === 0 && simPrime > 10) {
    // Fake Cunningham chain
    io.emit('new_data', normalise({
      type: 'chain', start: simPrime - 30, length: 3 + Math.floor(Math.random() * 3), kind: 1, timestamp: Date.now(),
    }));
  }
  if (simCount % 300 === 0 && simPrime > 5) {
    io.emit('new_data', normalise({
      type: 'tuple', start: simPrime - 8, kind: 3, timestamp: Date.now(),
    }));
  }
  if (simCount % 250 === 0 && simPrime > 5) {
    io.emit('new_data', normalise({
      type: 'ap', start: simPrime - 12, step: 6, length: 3, timestamp: Date.now(),
    }));
  }
}

function startSimulator() {
  if (simInterval) return;
  console.log('[sim] No C++ results file — starting live simulator…');
  console.log(`[sim] Will stop automatically when ${RESULTS_FILE} is created.`);
  simInterval = setInterval(simStep, 200);
}

// ── Startup ───────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   AMD Prime Discovery Engine — Bridge Server     ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log(`  Socket.IO  : http://localhost:${PORT}`);
  console.log(`  Dashboard  : http://localhost:${PORT}/`);
  console.log(`  Health     : http://localhost:${PORT}/health`);
  console.log(`  Inject API : POST http://localhost:${PORT}/inject`);
  console.log(`  Watching   : ${RESULTS_FILE}`);
  console.log('');

  // Watch for the results file
  if (!fs.existsSync(RESULTS_FILE)) {
    console.warn(`  ⚠  Results file not found yet: ${RESULTS_FILE}`);
    console.warn(`     Waiting for C++ engine to create it…`);
    // Start simulator after a 2s grace period
    setTimeout(startSimulator, 2000);
  } else {
    // Start reading from end of existing file (don't replay old data)
    bytesRead = fs.statSync(RESULTS_FILE).size;
    console.log(`  📄 Found existing file (${bytesRead} bytes) — tailing from end`);
  }

  // Poll every POLL_INTERVAL ms
  setInterval(tailFile, POLL_INTERVAL);
  console.log(`  ⏱  Polling every ${POLL_INTERVAL}ms`);
  console.log('');
});

// Graceful shutdown
process.on('SIGINT',  () => { console.log('\n[server] Shutting down…'); clearInterval(simInterval); server.close(); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n[server] Shutting down…'); clearInterval(simInterval); server.close(); process.exit(0); });
