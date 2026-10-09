export const MATERIAL_FRAME_MS = 1000 / 60;
export const MATERIAL_PHASES = 68;

/** Samples each recorded unit leg at its original phase, preserving intervening
 * holds. A diagonal shortcut or first-to-last interpolation is never used. */
export function positionOnPath(path, alpha) {
  const points = path.points, phase = Math.max(0, Math.min(1, alpha)) * MATERIAL_PHASES;
  let x = points[0], y = points[1];
  for (let j = 3; j < points.length; j += 3) {
    const nx = points[j], ny = points[j + 1], end = points[j + 2];
    if (phase < end - 1) return [x, y];
    if (phase < end) { const u = phase - (end - 1); return [x + (nx - x) * u, y + (ny - y) * u]; }
    x = nx; y = ny;
  }
  return [x, y];
}

export function validateMaterialFrame(frame) {
  if (!frame || !Number.isSafeInteger(frame.token) || frame.token < 1 || !Number.isSafeInteger(frame.ruleTick) || !Array.isArray(frame.paths)) throw Error('Invalid material frame');
  const ids = new Set();
  for (const path of frame.paths) {
    if (!Number.isSafeInteger(path.id) || ids.has(path.id) || !Array.isArray(path.points) || path.points.length < 6 || path.points.length > 207 || path.points.length % 3) throw Error('Invalid material path');
    ids.add(path.id);
    for (let j = 0; j < path.points.length; j += 3) {
      const x = path.points[j], y = path.points[j + 1], phase = path.points[j + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isInteger(phase) || phase < 0 || phase > MATERIAL_PHASES) throw Error('Invalid material point');
      if (j === 0 && phase !== 0) throw Error('Material path must include its starting pose');
      if (j && (phase <= path.points[j - 1] || Math.abs(x - path.points[j - 3]) + Math.abs(y - path.points[j - 2]) !== 1)) throw Error('Material path must contain ordered actual unit legs');
    }
  }
  return frame;
}

/** Presentation is explicitly bounded. Completion is returned only after the
 * caller has painted the final pose and calls didDraw(), never from a timer. */
export class MaterialFrameQueue {
  constructor({ durationMs = MATERIAL_FRAME_MS } = {}) { this.durationMs = durationMs; this.epoch = 0; this.queue = []; this.startedAt = null; this.pausedAt = null; this.lastCompleted = 0; this.sampledCompletion = null; this.metrics = { completed: 0, maxPending: 0, receivedPathPoints: 0 }; }
  reset(epoch) { this.epoch = epoch; this.queue = []; this.startedAt = null; this.pausedAt = null; this.lastCompleted = 0; this.sampledCompletion = null; }
  accept(epoch, frames, now) {
    if (epoch < this.epoch) return false;
    if (epoch !== this.epoch) this.reset(epoch);
    for (const frame of frames) {
      validateMaterialFrame(frame);
      if (frame.token <= this.lastCompleted || this.queue.some(f => f.token === frame.token)) continue;
      if (this.queue.length >= 2) throw Error('Material presentation queue exceeded two frames');
      if (this.queue.length && frame.token <= this.queue.at(-1).token) throw Error('Material presentation order reversed');
      this.queue.push(frame); this.metrics.receivedPathPoints += frame.paths.reduce((sum, path) => sum + path.points.length / 3, 0);
      if (this.startedAt === null) this.startedAt = this.pausedAt ?? now;
      this.metrics.maxPending = Math.max(this.metrics.maxPending, this.queue.length);
    }
    return true;
  }
  setPaused(paused, now) {
    if (paused && this.pausedAt === null) this.pausedAt = now;
    if (!paused && this.pausedAt !== null) { if (this.startedAt !== null) this.startedAt += now - this.pausedAt; this.pausedAt = null; }
  }
  sample(now) {
    const frame = this.queue[0];
    this.sampledCompletion = null;
    if (!frame) return null;
    const t = this.pausedAt ?? now, alpha = Math.max(0, Math.min(1, (t - this.startedAt) / this.durationMs));
    if (alpha === 1) this.sampledCompletion = frame.token;
    return { frame, alpha, positions: frame.paths.map(path => ({ id: path.id, xy: positionOnPath(path, alpha) })) };
  }
  didDraw() {
    if (this.sampledCompletion === null || this.queue[0]?.token !== this.sampledCompletion) return null;
    const frame = this.queue.shift(); this.lastCompleted = frame.token; this.metrics.completed++;
    this.startedAt = this.queue.length ? this.startedAt + this.durationMs : null; this.sampledCompletion = null;
    return { epoch: this.epoch, token: frame.token, ruleTick: frame.ruleTick };
  }
  read() { return { epoch: this.epoch, pending: this.queue.length, tokens: this.queue.map(f => f.token), presentedToken: this.lastCompleted, paused: this.pausedAt !== null, ...this.metrics }; }
}

function hashUnit(id, salt) {
  let h = Math.imul((id >>> 0) ^ salt, 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function materialStyle(id) {
  return { dx: (hashUnit(id, 0xa511e9b3) * 2 - 1) * .18, dy: (hashUnit(id, 0x63d83595) * 2 - 1) * .18,
    radius: (.95 + hashUnit(id, 0xb5297a4d) * .3) / 2, brightness: .8 + hashUnit(id, 0x1b56c4e9) * .3 };
}
function tint(hex, brightness) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const n = Number.parseInt(hex.slice(1), 16), channel = shift => Math.min(255, Math.round(((n >>> shift) & 255) * brightness));
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}
function tinyGrain(context, body, style, rawCells) {
  if (rawCells) { context.fillRect(body.x - .5, body.y - .5, 1, 1); return; }
  context.beginPath(); context.arc(body.x + style.dx, body.y + style.dy, style.radius, 0, Math.PI * 2); context.fill();
}

/** Cell-sized fixed identity noise. Settled material is cached; only recorded
 * moving IDs are redrawn each rAF. There is no legacy large circle/mask. */
export class CALayerRenderer {
  constructor({ createCanvas = () => document.createElement('canvas'), resolveColor = c => ['', '#eac370', '#4fc0b3', '#d378a3', '#789fef'][c], rawCells = false } = {}) {
    this.createCanvas = createCanvas; this.resolveColor = resolveColor; this.rawCells = rawCells; this.styles = new Map(); this.bodies = new Map(); this.moving = new Set(); this.positions = new Map(); this.canvas = null; this.context = null; this.width = 0; this.height = 0; this.palette = null; this.dirty = true; this.mode = 'ca-cell-cached-layer'; this.fallbackReason = null;
    this.scratchCanvas = null; this.scratchContext = null; this.tileSize = 16; this.tileColumns = Math.ceil(288 / this.tileSize); this.tileRows = Math.ceil(432 / this.tileSize); this.tiles = new Map(); this.staticRecords = new Map(); this.dirtyTiles = new Set(); this.paintRanks = new Map(); this.nextPaintRank = 0;
    this.metrics = { frames: 0, fullCacheRebuilds: 0, dirtyCacheRebuilds: 0, dirtyTilesRepainted: 0, lastDirtyTiles: 0, cacheTileCopies: 0, cacheCopiedPixels: 0, lastCacheCopiedPixels: 0, stableCellPaints: 0, dynamicCellPaints: 0, lastStablePaints: 0, lastDynamicPaints: 0 };
  }
  tileRect(key) {
    const x = (key % this.tileColumns) * this.tileSize, y = Math.floor(key / this.tileColumns) * this.tileSize;
    return { x0: Math.floor(x * this.width / 288), y0: Math.floor(y * this.height / 432),
      x1: Math.floor(Math.min(288, x + this.tileSize) * this.width / 288), y1: Math.floor(Math.min(432, y + this.tileSize) * this.height / 432) };
  }
  footprintKeys(body) {
    const style = this.styles.get(body.id), sx = this.width / 288, sy = this.height / 432;
    const x = body.x + (this.rawCells ? 0 : style.dx), y = body.y + (this.rawCells ? 0 : style.dy), radius = this.rawCells ? .5 : style.radius;
    // A one-device-pixel fringe includes antialiased neighbors. Tile bounds use
    // shared integer device pixels, while every arc retains the original origin.
    const x0 = Math.max(0, Math.floor((x - radius) * sx) - 1), y0 = Math.max(0, Math.floor((y - radius) * sy) - 1);
    const x1 = Math.min(this.width, Math.ceil((x + radius) * sx) + 1), y1 = Math.min(this.height, Math.ceil((y + radius) * sy) + 1), keys = [];
    const left = Math.max(0, Math.floor(x0 / sx / this.tileSize) - 1), right = Math.min(this.tileColumns - 1, Math.floor(x1 / sx / this.tileSize) + 1);
    const top = Math.max(0, Math.floor(y0 / sy / this.tileSize) - 1), bottom = Math.min(this.tileRows - 1, Math.floor(y1 / sy / this.tileSize) + 1);
    for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) {
      const key = row * this.tileColumns + col, tile = this.tileRect(key);
      if (tile.x0 < x1 && tile.x1 > x0 && tile.y0 < y1 && tile.y1 > y0) keys.push(key);
    }
    return keys;
  }
  removeStatic(id) {
    const record = this.staticRecords.get(id); if (!record) return;
    for (const key of record.keys) { const ids = this.tiles.get(key); ids?.delete(id); if (ids?.size === 0) this.tiles.delete(key); this.dirtyTiles.add(key); }
    this.staticRecords.delete(id);
  }
  addStatic(id, invalidate = true) {
    if (this.dirty || !this.width || !this.height || this.moving.has(id) || !this.bodies.has(id) || this.staticRecords.has(id)) return;
    const keys = this.footprintKeys(this.bodies.get(id)); this.staticRecords.set(id, { keys });
    for (const key of keys) { if (!this.tiles.has(key)) this.tiles.set(key, new Set()); this.tiles.get(key).add(id); if (invalidate) this.dirtyTiles.add(key); }
  }
  rebuildStaticIndex() {
    this.tiles.clear(); this.staticRecords.clear(); this.dirtyTiles.clear();
    for (const body of this.bodies.values()) if (!this.moving.has(body.id)) this.addStatic(body.id, false);
  }
  apply(patch) {
    if (patch.reset) { this.bodies.clear(); this.styles.clear(); this.tiles.clear(); this.staticRecords.clear(); this.dirtyTiles.clear(); this.paintRanks.clear(); this.nextPaintRank = 0; this.dirty = true; }
    for (const id of patch.removed) { this.removeStatic(id); this.bodies.delete(id); this.positions.delete(id); this.styles.delete(id); this.paintRanks.delete(id); }
    for (const body of patch.upsert) {
      const old = this.bodies.get(body.id), changed = !old || old.x !== body.x || old.y !== body.y || old.color !== body.color;
      if (changed) this.removeStatic(body.id);
      this.bodies.set(body.id, { ...body });
      if (!this.paintRanks.has(body.id)) this.paintRanks.set(body.id, this.nextPaintRank++);
      if (!this.styles.has(body.id)) this.styles.set(body.id, materialStyle(body.id));
      if (!this.moving.has(body.id)) this.addStatic(body.id);
    }
  }
  synchronize(queue, sample) {
    const moving = new Set(), positions = new Map();
    // The earliest unpresented pose wins when an ID occurs in both frames.
    for (const frame of queue) for (const path of frame.paths) if (!moving.has(path.id)) { moving.add(path.id); positions.set(path.id, path.points.slice(0, 2)); }
    if (sample) for (const { id, xy } of sample.positions) positions.set(id, xy);
    const membershipChanged = moving.size !== this.moving.size || [...moving].some(id => !this.moving.has(id));
    if (membershipChanged) for (const id of moving) if (!this.moving.has(id)) this.removeStatic(id);
    const previousMoving = this.moving; this.moving = moving; this.positions = positions;
    if (membershipChanged) for (const id of previousMoving) if (!moving.has(id)) this.addStatic(id);
  }
  configure(width, height, palette) {
    if (this.mode !== 'full-cell-fallback' && !this.canvas) { try { this.canvas = this.createCanvas(); this.context = this.canvas?.getContext('2d', { alpha: true }); if (!this.context) throw Error('Cell cache 2D canvas unavailable'); } catch (error) { this.fallback(error.message); } }
    if (width !== this.width || height !== this.height) { this.width = width; this.height = height; if (this.canvas) { this.canvas.width = width; this.canvas.height = height; } this.dirty = true; }
    if (palette !== this.palette) { this.palette = palette; this.dirty = true; }
  }
  paint(context, bodies) {
    let n = 0;
    for (const body of bodies) {
      const style = this.styles.get(body.id), baseColor = this.resolveColor(body.color);
      if (style.baseColor !== baseColor) { style.baseColor = baseColor; style.fillColor = tint(baseColor, style.brightness); }
      context.fillStyle = this.rawCells ? baseColor : style.fillColor; tinyGrain(context, body, style, this.rawCells); n++;
    }
    return n;
  }
  fallback(reason) { this.mode = 'full-cell-fallback'; this.fallbackReason = String(reason); this.canvas = null; this.context = null; this.dirty = true; }
  draw(context) {
    this.metrics.frames++; this.metrics.lastStablePaints = 0; this.metrics.lastDirtyTiles = 0; this.metrics.lastCacheCopiedPixels = 0;
    if (this.mode !== 'full-cell-fallback') {
      if (this.dirty) { const c = this.context; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.width, this.height); c.setTransform(this.width / 288, 0, 0, this.height / 432, 0, 0); const stable = [...this.bodies.values()].filter(b => !this.moving.has(b.id)); const count = this.paint(c, stable); this.metrics.lastStablePaints = count; this.metrics.stableCellPaints += count; this.metrics.fullCacheRebuilds++; this.dirty = false; this.rebuildStaticIndex(); }
      else if (this.dirtyTiles.size) {
        try {
          if (!this.scratchCanvas) { this.scratchCanvas = this.createCanvas(); this.scratchContext = this.scratchCanvas?.getContext('2d', { alpha: true }); if (!this.scratchContext) throw Error('Local cell repaint canvas unavailable'); }
          if (this.scratchCanvas.width !== this.width || this.scratchCanvas.height !== this.height) { this.scratchCanvas.width = this.width; this.scratchCanvas.height = this.height; }
        } catch (error) { this.fallback(error.message); }
        if (this.mode !== 'full-cell-fallback') {
        const c = this.context, scratch = this.scratchContext; let paints = 0;
        for (const key of this.dirtyTiles) {
          const tile = this.tileRect(key), width = tile.x1 - tile.x0, height = tile.y1 - tile.y0;
          scratch.setTransform(1, 0, 0, 1, 0, 0); scratch.clearRect(tile.x0, tile.y0, width, height);
          scratch.setTransform(this.width / 288, 0, 0, this.height / 432, 0, 0);
          // Clipping a circle at the tile edge can alter its antialias raster.
          // Paint uncut arcs at the original canvas origin, then copy exact
          // device pixels. The screen still composites one complete cache.
          const ids = [...(this.tiles.get(key) ?? [])].sort((a, b) => this.paintRanks.get(a) - this.paintRanks.get(b));
          paints += this.paint(scratch, ids.map(id => this.bodies.get(id)));
          c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(tile.x0, tile.y0, width, height); c.imageSmoothingEnabled = false;
          c.drawImage(this.scratchCanvas, tile.x0, tile.y0, width, height, tile.x0, tile.y0, width, height); c.restore();
          this.metrics.cacheTileCopies++; this.metrics.cacheCopiedPixels += width * height; this.metrics.lastCacheCopiedPixels += width * height;
        }
        this.metrics.lastStablePaints = paints; this.metrics.stableCellPaints += paints; this.metrics.lastDirtyTiles = this.dirtyTiles.size; this.metrics.dirtyTilesRepainted += this.dirtyTiles.size; this.metrics.dirtyCacheRebuilds++; this.dirtyTiles.clear();
        }
      }
      if (this.mode !== 'full-cell-fallback') context.drawImage(this.canvas, 0, 0, this.width, this.height, 0, 0, 288, 432);
    }
    const bodies = this.mode === 'full-cell-fallback' ? this.bodies.values() : [...this.moving].map(id => this.bodies.get(id)).filter(Boolean);
    const dynamic = []; for (const b of bodies) { const p = this.positions.get(b.id); dynamic.push(p ? { ...b, x: p[0], y: p[1] } : b); }
    this.metrics.lastDynamicPaints = this.paint(context, dynamic); this.metrics.dynamicCellPaints += this.metrics.lastDynamicPaints;
  }
  drawSelection(context, ids) { for (const id of ids) { const body = this.bodies.get(id); if (body) tinyGrain(context, body, this.styles.get(id), this.rawCells); } }
  read() { return { mode: this.mode, fallbackReason: this.fallbackReason, liveCount: this.bodies.size, stableCount: this.bodies.size - this.moving.size, dynamicCount: this.moving.size, countsConserved: true, style: this.rawCells ? 'raw-1px-cell' : 'fixed-id-micro-circle', styleCacheSize: this.styles.size, indexedStableCount: this.staticRecords.size, pendingDirtyTiles: this.dirtyTiles.size, ...this.metrics }; }
}
