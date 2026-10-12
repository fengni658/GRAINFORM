import {PALETTES} from './grain-palette.mjs';
import {GRAIN_SHAPE, GRAIN_OFFSET_BOUND, GRAIN_DIAMETER_SCALE, GRAIN_OUTLINES, GRAIN_LIGHT_EDGES, appendGrainPath} from './grain-material.mjs';
import {WIDTH,HEIGHT,VIEW_GRID_TOP,VIEW_GRID_HEIGHT} from './board-geometry.mjs';
import {MaterialContour, clipMaterialContour, paintContourRim, clipMaterialField} from './ca-contour.mjs';
const SQUARE_GRAINS = GRAIN_SHAPE === 'square';
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
  constructor({ durationMs = MATERIAL_FRAME_MS } = {}) { this.continuity = null; this.emptyAnchor = null; this.sampledAt = null; this.lastReceiptRaf = null; this.durationMs = durationMs; this.epoch = 0; this.queue = []; this.startedAt = null; this.pausedAt = null; this.lastCompleted = 0; this.sampledCompletion = null; this.metrics = { completed: 0, maxPending: 0, receivedPathPoints: 0 }; }
  reset(epoch) { this.invalidateContinuity(); this.epoch = epoch; this.queue = []; this.startedAt = null; this.pausedAt = null; this.lastCompleted = 0; this.sampledCompletion = null; }
  invalidateContinuity() { this.continuity = null; this.emptyAnchor = null; }
  // The game owns burst identity: intermediate phase transitions may not each
  // produce a snapshot. Missing identity fails closed to arrival-based timing.
  setContinuity(epoch, snapshot, reset = false) {
    const key = snapshot?.state === 'playing' && snapshot.phase === 'settling' &&
      Number.isSafeInteger(snapshot.settlingBurst) && snapshot.settlingBurst > 0 &&
      Number.isSafeInteger(snapshot.pieceId) ? `${epoch}:${snapshot.pieceId}:${snapshot.settlingBurst}` : null;
    if (reset || key !== this.continuity) this.emptyAnchor = null;
    this.continuity = key;
  }
  accept(epoch, frames, now) {
    if (epoch < this.epoch) return false;
    if (epoch !== this.epoch) this.reset(epoch);
    for (const frame of frames) {
      validateMaterialFrame(frame);
      if (frame.token <= this.lastCompleted || this.queue.some(f => f.token === frame.token)) continue;
      if (this.queue.length >= 2) throw Error('Material presentation queue exceeded two frames');
      if (this.queue.length && frame.token <= this.queue.at(-1).token) throw Error('Material presentation order reversed');
      if (!this.queue.length) {
        const anchor = this.emptyAnchor;
        this.emptyAnchor = null; // One shot; neither duplicates nor snapshots extend it.
        if (anchor && this.pausedAt === null && anchor.key === this.continuity &&
            anchor.epoch === epoch && frame.token === anchor.token + 1 &&
            now >= anchor.raf && now - anchor.raf <= this.durationMs) this.startedAt = anchor.raf;
      }
      this.queue.push(frame); this.metrics.receivedPathPoints += frame.paths.reduce((sum, path) => sum + path.points.length / 3, 0);
      if (this.startedAt === null) this.startedAt = this.pausedAt ?? now;
      this.metrics.maxPending = Math.max(this.metrics.maxPending, this.queue.length);
    }
    return true;
  }
  setPaused(paused, now) {
    if (paused) this.emptyAnchor = null;
    if (paused && this.pausedAt === null) this.pausedAt = now;
    if (!paused && this.pausedAt !== null) { if (this.startedAt !== null) this.startedAt += now - this.pausedAt; this.pausedAt = null; }
  }
  sample(now) {
    const frame = this.queue[0];
    this.sampledCompletion = null; this.sampledAt = now;
    if (!frame) return null;
    const t = this.pausedAt ?? now, alpha = Math.max(0, Math.min(1, (t - this.startedAt) / this.durationMs));
    if (alpha === 1) this.sampledCompletion = frame.token;
    return { frame, alpha, positions: frame.paths.map(path => ({ id: path.id, xy: positionOnPath(path, alpha) })) };
  }
  didDraw(rafTimestamp) {
    // Explicit rAF identity is required for continuity and forbids a second
    // receipt in that same callback, even if callers sample again. Legacy
    // callers without an rAF timestamp retain their original queue semantics.
    const hasRaf = Number.isFinite(rafTimestamp);
    if (hasRaf && (rafTimestamp !== this.sampledAt || rafTimestamp === this.lastReceiptRaf)) return null;
    if (this.sampledCompletion === null || this.queue[0]?.token !== this.sampledCompletion) return null;
    if (hasRaf) this.lastReceiptRaf = rafTimestamp;
    const frame = this.queue.shift(); this.lastCompleted = frame.token; this.metrics.completed++;
    this.emptyAnchor = !this.queue.length && hasRaf && this.continuity !== null && this.pausedAt === null
      ? { raf: rafTimestamp, epoch: this.epoch, token: frame.token, key: this.continuity } : null;
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
  const variant=Math.min(63, Math.floor(hashUnit(id, 0x9e3779b9) * 64));
  return { dx: (hashUnit(id, 0xa511e9b3) * 2 - 1) * GRAIN_OFFSET_BOUND, dy: (hashUnit(id, 0x63d83595) * 2 - 1) * GRAIN_OFFSET_BOUND,
    radius: GRAIN_DIAMETER_SCALE * (.95 + hashUnit(id, 0xb5297a4d) * .3) / 2,
    outline: GRAIN_OUTLINES[variant], lightEdge:GRAIN_LIGHT_EDGES[variant], facet: (variant & 7) === 0,
    brightness: .84 + Math.min(11, Math.floor(hashUnit(id, 0x1b56c4e9) * 12)) * .22 / 11 };
}
function tint(hex, brightness) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const n = Number.parseInt(hex.slice(1), 16), channel = shift => Math.min(255, Math.round(((n >>> shift) & 255) * brightness));
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}
function tinyGrain(context, body, style, rawCells, x = body.x, y = body.y) {
  if (rawCells || SQUARE_GRAINS) { context.fillRect(x - .5, y - .5, 1, 1); return; }
  context.beginPath(); appendGrainPath(context, x + style.dx, y + style.dy, style); context.fill();
}

/** Cell-sized fixed identity noise. Settled material is cached; only recorded
 * moving IDs are redrawn each rAF. There is no legacy large circle/mask. */
export class CALayerRenderer {
  constructor({ createCanvas = () => document.createElement('canvas'), resolveColor = c => PALETTES.standard[c], rawCells = false } = {}) {
    this.createCanvas = createCanvas; this.resolveColor = resolveColor; this.rawCells = rawCells; this.contour = new MaterialContour(); this.styles = new Map(); this.bodies = new Map(); this.moving = new Set(); this.physicalMoving = new Set(); this.anchorMoving = null; this.positions = new Map(); this.canvas = null; this.context = null; this.width = 0; this.height = 0; this.palette = null; this.dirty = true; this.mode = 'ca-cell-cached-layer'; this.fallbackReason = null;
    this.scratchCanvas = null; this.scratchContext = null; this.tileSize = 8; this.tileColumns = Math.ceil(WIDTH / this.tileSize); this.tileRows = Math.ceil(HEIGHT / this.tileSize); this.tiles = new Map(); this.staticRecords = new Map(); this.dirtyTiles = new Set(); this.paintRanks = new Map(); this.nextPaintRank = 0;
    this.tailStart=Infinity;this.tailIds=[];this.qualifyDirty=true;this.qualifyKeys=new Set;this.displayChanged=true;this.tailMetrics={qualifications:0,eligible:0,rejected:0,workScans:0,boundaryIds:0,tailPaints:0};
    this.paintRevision=0;this.selectionCache={canvas:null,context:null,valid:false,ids:[],fillStyle:null};this.selectionMetrics={builds:0,reuses:0,identityScans:0,paintedGrains:0,idComparisons:0,composites:0,lastIdentityScans:0,lastPaintedGrains:0,bytes:0};
    this.metrics = { frames: 0, fullCacheRebuilds: 0, dirtyCacheRebuilds: 0, dirtyTilesRepainted: 0, lastDirtyTiles: 0, cacheTileCopies: 0, cacheCopiedPixels: 0, lastCacheCopiedPixels: 0, stableCellPaints: 0, dynamicCellPaints: 0, lastStablePaints: 0, lastDynamicPaints: 0 };
  }
  orderedIds() { if(!this.paintOrder) this.paintOrder=[...this.bodies.keys()].sort((a,b)=>a-b); return this.paintOrder; }
  qualifyTail(allowDirect = true) {
    // Group opacity and non-source-over blending cannot be distributed over the
    // cached prefix and direct suffix. Merge once, then retain the correct cache.
    if(!allowDirect){
      if(Number.isFinite(this.tailStart)){
        for(const id of this.tailIds)for(const key of this.staticRecords.get(id)?.keys??[])this.dirtyTiles.add(key);
        this.tailMetrics.boundaryIds+=this.tailIds.length;this.tailStart=Infinity;this.tailIds=[];
      }
      this.qualifyDirty=true;return;
    }
    if(!this.qualifyDirty)return;
    if(this.physicalMoving.size&&!this.displayChanged)return;
    const order=this.orderedIds();let cutoff=Infinity,work=0,count=0;
    if(this.physicalMoving.size){let min=Infinity;for(const id of this.physicalMoving)if(this.bodies.has(id))min=Math.min(min,id);
      let lo=0,hi=order.length;while(lo<hi){const mid=(lo+hi)>>>1;if(order[mid]<min)lo=mid+1;else hi=mid;}count=order.length-lo;
      if(this.dirty)work=order.length;else{const ids=new Set;for(const key of this.qualifyKeys)for(const id of this.tiles.get(key)??[]){ids.add(id);this.tailMetrics.workScans++;}work=ids.size;}
      if(count&&count<=work){cutoff=min;this.tailMetrics.eligible++;}else this.tailMetrics.rejected++;
    }
    if(cutoff!==this.tailStart){const low=Math.min(cutoff,this.tailStart),high=Math.max(cutoff,this.tailStart);for(const id of order)if(id>=low&&id<high){for(const key of this.staticRecords.get(id)?.keys??[])this.dirtyTiles.add(key);this.tailMetrics.boundaryIds++;}this.tailStart=cutoff;}
    this.tailIds=Number.isFinite(cutoff)?order.filter(id=>id>=cutoff):[];
    this.tailMetrics.qualifications++;this.tailMetrics.lastSuffixCount=count;this.tailMetrics.lastCorrectTileWork=work;this.qualifyDirty=false;this.qualifyKeys.clear();
  }
  tileRect(key) {
    const x = (key % this.tileColumns) * this.tileSize, y = Math.floor(key / this.tileColumns) * this.tileSize;
    return { x0: Math.floor(x * this.width / WIDTH), y0: Math.max(0, Math.floor((y - VIEW_GRID_TOP) * this.height / VIEW_GRID_HEIGHT)),
      x1: Math.floor(Math.min(WIDTH, x + this.tileSize) * this.width / WIDTH), y1: Math.min(this.height, Math.floor((Math.min(HEIGHT, y + this.tileSize) - VIEW_GRID_TOP) * this.height / VIEW_GRID_HEIGHT)) };
  }
  footprintKeys(body) {
    const style = this.styles.get(body.id), sx = this.width / WIDTH, sy = this.height / VIEW_GRID_HEIGHT;
    const pos=this.moving.has(body.id)?this.positions.get(body.id):null;
    const square=this.rawCells||SQUARE_GRAINS;
    const x = (pos?pos[0]:body.x) + (square ? 0 : style.dx), y = (pos?pos[1]:body.y) + (square ? 0 : style.dy), radius = square ? .5 : style.radius;
    // A one-device-pixel fringe includes antialiased neighbors. Tile bounds use
    // shared integer device pixels, while every arc retains the original origin.
    const x0 = Math.max(0, Math.floor((x - radius) * sx) - 1), y0 = Math.max(0, Math.floor((y - radius - VIEW_GRID_TOP) * sy) - 1);
    const x1 = Math.min(this.width, Math.ceil((x + radius) * sx) + 1), y1 = Math.min(this.height, Math.ceil((y + radius - VIEW_GRID_TOP) * sy) + 1), keys = [];
    const left = Math.max(0, Math.floor(x0 / sx / this.tileSize) - 1), right = Math.min(this.tileColumns - 1, Math.floor(x1 / sx / this.tileSize) + 1);
    const top = Math.max(0, Math.floor((y0 / sy + VIEW_GRID_TOP) / this.tileSize) - 1), bottom = Math.min(this.tileRows - 1, Math.floor((y1 / sy + VIEW_GRID_TOP) / this.tileSize) + 1);
    for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) {
      const key = row * this.tileColumns + col, tile = this.tileRect(key);
      if (tile.x0 < x1 && tile.x1 > x0 && tile.y0 < y1 && tile.y1 > y0) keys.push(key);
    }
    return keys;
  }
  removeStatic(id) {
    const record = this.staticRecords.get(id); if (!record) return;
    for (const key of record.keys) { const ids = this.tiles.get(key); ids?.delete(id); if (ids?.size === 0) this.tiles.delete(key); if(id<this.tailStart)this.dirtyTiles.add(key); }
    this.staticRecords.delete(id);
  }
  addStatic(id, invalidate = true) {
    if (this.dirty || !this.width || !this.height || !this.bodies.has(id) || this.staticRecords.has(id)) return;
    const body=this.bodies.get(id),pos=this.positions.get(id),keys=this.footprintKeys(body); this.staticRecords.set(id,{keys,id,rank:id,x:pos?pos[0]:body.x,y:pos?pos[1]:body.y});
    for (const key of keys) { if (!this.tiles.has(key)) this.tiles.set(key, new Set()); this.tiles.get(key).add(id); if (invalidate&&id<this.tailStart) this.dirtyTiles.add(key); }
  }
  rebuildStaticIndex() {
    this.tiles.clear(); this.staticRecords.clear(); this.dirtyTiles.clear();
    for (const id of this.orderedIds()) this.addStatic(id, false);
  }
  apply(patch) {
    let visualChange=!!patch.reset||patch.removed.length>0;
    
    if(patch.reset||patch.removed.length||patch.upsert.some(b=>!this.bodies.has(b.id))){this.paintOrder=null;this.qualifyDirty=true;}
    if (patch.reset) { this.tailStart=Infinity;this.tailIds=[];this.qualifyKeys.clear();this.bodies.clear(); this.styles.clear(); this.tiles.clear(); this.staticRecords.clear(); this.dirtyTiles.clear(); this.paintRanks.clear(); this.nextPaintRank = 0; this.dirty = true; }
    for (const id of patch.removed) { this.removeStatic(id); this.bodies.delete(id); this.positions.delete(id); this.styles.delete(id); this.paintRanks.delete(id); }
    for (const body of patch.upsert) {
      const old = this.bodies.get(body.id), changed = !old || old.x !== body.x || old.y !== body.y || old.color !== body.color;
      if (changed) {this.removeStatic(body.id);visualChange=true;}
      this.bodies.set(body.id, { ...body });
      if (!this.paintRanks.has(body.id)) this.paintRanks.set(body.id, body.id);
      if (!this.styles.has(body.id)) this.styles.set(body.id, materialStyle(body.id));
      this.addStatic(body.id);
    }
    if(visualChange){this.displayChanged=true;this.paintRevision++;this.selectionCache.valid=false;}
    if(patch.reset)this.selectionCache.ids=[];
  }
  synchronize(queue, sample) {
    queue = sample?.displayQueue ?? queue;
    const moving = new Set(), positions = new Map();
    // The earliest unpresented pose wins when an ID occurs in both frames.
    for (const frame of queue) for (const path of frame.paths) if (!moving.has(path.id)) { moving.add(path.id); positions.set(path.id, path.points.slice(0, 2)); }
    if (sample) for (const { id, xy } of sample.positions) if(moving.has(id)) positions.set(id, xy);
    this.physicalMoving = moving; this.positions = positions; this.syncMovingLayers();
  }
  setAnchorMoving(ids) { if (ids === this.anchorMoving) return; this.anchorMoving = ids; this.syncMovingLayers(); }
  syncMovingLayers() {
    const moving = new Set();
    for (const id of this.anchorMoving ?? []) if(this.bodies.has(id)&&!this.physicalMoving.has(id))moving.add(id);
    for (const id of this.physicalMoving) moving.add(id);
    // Membership is not painter order. Invalidate only changed displayed footprints.
    const membershipChanged=moving.size!==this.moving.size||[...moving].some(id=>!this.moving.has(id));if(membershipChanged)this.qualifyDirty=true;
    const affected=new Set([...this.moving,...moving]);this.moving=moving;
    let changed=false;
    for(const id of affected){const body=this.bodies.get(id);if(!body)continue;const pos=this.positions.get(id),x=pos?pos[0]:body.x,y=pos?pos[1]:body.y,record=this.staticRecords.get(id);if(this.qualifyDirty)for(const key of record?.keys??[])this.qualifyKeys.add(key);if(!record||record.x!==x||record.y!==y){this.removeStatic(id);this.addStatic(id);changed=true;}if(this.qualifyDirty)for(const key of this.staticRecords.get(id)?.keys??[])this.qualifyKeys.add(key);}
    if(changed){this.displayChanged=true;this.paintRevision++;this.selectionCache.valid=false;}
  }
  configure(width, height, palette) {
    if(width!==this.width||height!==this.height||palette!==this.palette){this.paintRevision++;this.selectionCache.valid=false;if(this.selectionCache.canvas){this.selectionCache.canvas.width=width;this.selectionCache.canvas.height=height;this.selectionMetrics.bytes=width*height*4;}}
    if (this.mode !== 'full-cell-fallback' && !this.canvas) { try { this.canvas = this.createCanvas(); this.context = this.canvas?.getContext('2d', { alpha: true }); if (!this.context) throw Error('Cell cache 2D canvas unavailable'); } catch (error) { this.fallback(error.message); } }
    if (width !== this.width || height !== this.height) { this.width = width; this.height = height; if (this.canvas) { this.canvas.width = width; this.canvas.height = height; } this.dirty = true; }
    if (palette !== this.palette) { this.palette = palette; this.dirty = true; }
  }
  paint(context, bodies, positions = null, ids = false) {
    let n = 0;
    for (const entry of bodies) {
      const body = ids ? this.bodies.get(entry) : entry; if (ids && !body) continue;
      const p = positions?.get(body.id), x = p ? p[0] : body.x, y = p ? p[1] : body.y;
      const style = this.styles.get(body.id), baseColor = this.resolveColor(body.color);
      if (style.baseColor !== baseColor) { style.baseColor = baseColor; style.fillColor = tint(baseColor, style.brightness); style.facetColor = tint(baseColor, Math.min(1.16,style.brightness + .08)); }
      context.fillStyle = this.rawCells ? baseColor : style.fillColor; tinyGrain(context, body, style, this.rawCells, x, y);
      if (!this.rawCells && !SQUARE_GRAINS && style.facet) {
        // One restrained diffuse facet, always facing upper-left. No glitter,
        // outline stroke, cast shadow, extra alpha pass or transient random noise.
        const points=style.outline,edge=style.lightEdge;
        const a=points[edge],b=points[(edge+1)%points.length],gx=x+style.dx,gy=y+style.dy,r=style.radius;
        context.fillStyle=style.facetColor;context.beginPath();context.moveTo(gx+a[0]*r*.9,gy+a[1]*r*.9);context.lineTo(gx+b[0]*r*.9,gy+b[1]*r*.9);context.lineTo(gx-r*.08,gy-r*.08);context.closePath();context.fill();
      }
      n++;
    }
    return n;
  }
  fallback(reason) { this.mode = 'full-cell-fallback'; this.fallbackReason = String(reason); this.canvas = null; this.context = null; this.dirty = true; }
  draw(context, selection = null, presentation = null) {
    // Nonlocal compositing modes retain separate material and selection scopes.
    // Normal source-over selection uses the cached visible-coverage mask.
    if (selection && context.globalCompositeOperation !== 'source-over') {
      this.draw(context);
      context.save();
      try {
        context.globalAlpha = selection.alpha;
        context.fillStyle = selection.fillStyle;
        this.drawSelection(context, selection.ids);
      } finally { context.restore(); }
      return;
    }
    context.save();
    try {

    // Arbitrary caller clips cannot be inspected. Only the application's own
    // device-aligned board context may opt in; generic Canvas callers use cache.
    let direct=false;
    if(presentation?.standardBoard===true&&context.globalAlpha===1&&context.globalCompositeOperation==='source-over'&&context.shadowBlur===0&&context.shadowOffsetX===0&&context.shadowOffsetY===0&&(!context.filter||context.filter==='none')){
      const t=context.getTransform?.(),sx=this.width/WIDTH,sy=this.height/VIEW_GRID_HEIGHT;
      const near=(a,b)=>Math.abs(a-b)<=1e-7*Math.max(1,Math.abs(b));
      direct=!!t&&near(t.a,sx)&&near(t.d,sy)&&near(t.b,0)&&near(t.c,0)&&near(t.e,0)&&near(t.f,-VIEW_GRID_TOP*sy);
    }
    this.qualifyTail(direct);
    this.metrics.frames++; this.metrics.lastStablePaints = 0; this.metrics.lastDirtyTiles = 0; this.metrics.lastCacheCopiedPixels = 0;
    let anchorPaints = 0, anchorComposited = false;
    if (this.mode !== 'full-cell-fallback') {
      if (this.dirty) { const c = this.context; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.width, this.height); c.setTransform(this.width / WIDTH, 0, 0, this.height / VIEW_GRID_HEIGHT, 0, -VIEW_GRID_TOP * this.height / VIEW_GRID_HEIGHT); const count = this.paint(c,this.orderedIds().filter(id=>id<this.tailStart),this.positions,true); this.metrics.lastStablePaints = count; this.metrics.stableCellPaints += count; this.metrics.fullCacheRebuilds++; this.dirty = false; this.rebuildStaticIndex(); }
      else if (this.dirtyTiles.size) {
        try {
          if (!this.scratchCanvas) { this.scratchCanvas = this.createCanvas(); this.scratchContext = this.scratchCanvas?.getContext('2d', { alpha: true }); if (!this.scratchContext) throw Error('Local cell repaint canvas unavailable'); }
          if (this.scratchCanvas.width !== this.width || this.scratchCanvas.height !== this.height) { this.scratchCanvas.width = this.width; this.scratchCanvas.height = this.height; }
        } catch (error) { this.fallback(error.message); }
        if (this.mode !== 'full-cell-fallback') {
        const c = this.context, scratch = this.scratchContext; let paints = 0;
        // Rasterize the union once before copying any tile. Keep global paint
        // order and original canvas origin, so every copied pixel is identical
        // to the per-tile raster; shared-border grains are painted only once.
        const ids = new Set();
        for (const key of this.dirtyTiles) for (const id of this.tiles.get(key) ?? []) if(id<this.tailStart)ids.add(id);
        if (ids.size) {
          // Static records already carry immutable insertion ranks. Sort those
          // directly: no two Map lookups per comparator, and no body-array copy.
          const ordered = [];
          for (const id of ids) ordered.push(this.staticRecords.get(id));
          ordered.sort((a, b) => a.rank - b.rank);
          for (let i = 0; i < ordered.length; i++) ordered[i] = ordered[i].id;
          scratch.setTransform(1, 0, 0, 1, 0, 0); scratch.clearRect(0, 0, this.width, this.height);
          scratch.setTransform(this.width / WIDTH, 0, 0, this.height / VIEW_GRID_HEIGHT, 0, -VIEW_GRID_TOP * this.height / VIEW_GRID_HEIGHT);
          paints = this.paint(scratch, ordered, this.positions, true);
        }
        // Copy disjoint horizontal runs with identical integer tile boundaries.
        // No extra pixels are cleared or copied, and original grain raster/order
        // stays on the same scratch surface. Save/transform once for the union.
        const sortedKeys = [...this.dirtyTiles].sort((a, b) => a - b);
        c.save();
        try {
          c.setTransform(1, 0, 0, 1, 0, 0); c.imageSmoothingEnabled = false;
          for (let i = 0; i < sortedKeys.length;) {
            const first = sortedKeys[i++]; let last = first;
            while (i < sortedKeys.length && sortedKeys[i] === last + 1 && Math.floor(sortedKeys[i] / this.tileColumns) === Math.floor(first / this.tileColumns)) last = sortedKeys[i++];
            const left = this.tileRect(first), right = this.tileRect(last), width = right.x1 - left.x0, height = left.y1 - left.y0;
            c.clearRect(left.x0, left.y0, width, height);
            // An empty union has no pixels to copy. Keep the identical clear
            // runs and scratch initialization/failure boundary above.
            if (ids.size) {
              c.drawImage(this.scratchCanvas, left.x0, left.y0, width, height, left.x0, left.y0, width, height);
              this.metrics.cacheTileCopies++; this.metrics.cacheCopiedPixels += width * height; this.metrics.lastCacheCopiedPixels += width * height;
            }
          }
        } finally { c.restore(); }
        this.metrics.lastStablePaints = paints; this.metrics.stableCellPaints += paints; this.metrics.lastDirtyTiles = this.dirtyTiles.size; this.metrics.dirtyTilesRepainted += this.dirtyTiles.size; this.metrics.dirtyCacheRebuilds++; this.dirtyTiles.clear();
        }
      }
      if (this.mode !== 'full-cell-fallback') context.drawImage(this.canvas,0,0,this.width,this.height,0,VIEW_GRID_TOP,WIDTH,VIEW_GRID_HEIGHT);
    }
    const fallback = this.mode === 'full-cell-fallback';
    // Recovery and cache use immutable numeric-ID order, independent of activity.
    this.metrics.lastDynamicPaints = fallback ? this.paint(context,this.orderedIds(),this.positions,true) : this.paint(context,this.tailIds,this.positions,true);
    if(!fallback)this.tailMetrics.tailPaints+=this.metrics.lastDynamicPaints;this.displayChanged=false;
    this.metrics.dynamicCellPaints += this.metrics.lastDynamicPaints;
    // Preserve individual full-glyph fill order inside the caller board clip
    // and body (not interpolated) selection coordinates. No group compositing.
    if (selection) {
      context.save();
      try {
        context.globalAlpha = selection.alpha;
        context.fillStyle = selection.fillStyle;
        this.drawSelection(context, selection.ids);
      } finally { context.restore(); }
    }
    } finally { context.restore(); }
  }
  paintSelection(context, ids) { for (const id of ids) { const body=this.bodies.get(id);if(body)tinyGrain(context,body,this.styles.get(id),this.rawCells); } }
  selectionMask(ids,fillStyle) {
    const cache=this.selectionCache,m=this.selectionMetrics;m.lastIdentityScans=0;m.lastPaintedGrains=0;m.idComparisons+=ids.length;
    if(cache.valid&&cache.revision===this.paintRevision&&cache.fillStyle===fillStyle&&ids.length===cache.ids.length&&ids.every((id,i)=>id===cache.ids[i])){m.reuses++;return cache.empty?null:cache.canvas;}
    cache.valid=false;const selected=new Set(ids.filter(id=>this.bodies.has(id)));
    if(!selected.size){cache.empty=true;cache.ids=ids.slice();cache.fillStyle=fillStyle;cache.revision=this.paintRevision;cache.valid=true;return null;}
    if(!cache.canvas){const canvas=this.createCanvas(),c=canvas?.getContext('2d',{alpha:true});if(!c)throw Error('Visible selection mask unavailable');cache.canvas=canvas;cache.context=c;}
    const canvas=cache.canvas,c=cache.context;if(canvas.width!==this.width)canvas.width=this.width;if(canvas.height!==this.height)canvas.height=this.height;m.bytes=this.width*this.height*4;
    c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.globalCompositeOperation='source-over';c.clearRect(0,0,this.width,this.height);c.setTransform(this.width/WIDTH,0,0,this.height/VIEW_GRID_HEIGHT,0,-VIEW_GRID_TOP*this.height/VIEW_GRID_HEIGHT);
    // Existing tile membership conservatively contains every potential occluder.
    // No per-frame full scene repaint: the resulting mask is reused through flash.
    let relevant=null;if(this.mode!=='full-cell-fallback'&&!this.dirty){relevant=new Set;for(const id of selected)for(const key of this.staticRecords.get(id)?.keys??[])for(const other of this.tiles.get(key)??[])relevant.add(other);for(const id of selected)relevant.add(id);}
    const paint=id=>{if(relevant&&!relevant.has(id))return;const b=this.bodies.get(id);if(!b)return;const p=this.moving.has(id)?this.positions.get(id):null,x=p?p[0]:b.x,y=p?p[1]:b.y,style=this.styles.get(id);c.globalCompositeOperation=selected.has(id)?'source-over':'destination-out';c.fillStyle=selected.has(id)?fillStyle:'#000000';tinyGrain(c,b,style,this.rawCells,x,y);if(!this.rawCells&&!SQUARE_GRAINS&&style.facet){const points=style.outline,edge=style.lightEdge,a=points[edge],q=points[(edge+1)%points.length],gx=x+style.dx,gy=y+style.dy,r=style.radius;c.beginPath();c.moveTo(gx+a[0]*r*.9,gy+a[1]*r*.9);c.lineTo(gx+q[0]*r*.9,gy+q[1]*r*.9);c.lineTo(gx-r*.08,gy-r*.08);c.closePath();c.fill();}m.lastPaintedGrains++;};
    for(const id of this.orderedIds()){m.lastIdentityScans++;paint(id);}
    m.builds++;m.identityScans+=m.lastIdentityScans;m.paintedGrains+=m.lastPaintedGrains;cache.empty=false;cache.ids=ids.slice();cache.fillStyle=fillStyle;cache.revision=this.paintRevision;cache.valid=true;return canvas;
  }
  drawSelection(context,ids){context.save();try{if(context.globalCompositeOperation!=='source-over'){this.paintSelection(context,ids);return;}if(!context.globalAlpha)return;const mask=this.selectionMask(ids,context.fillStyle);if(mask){context.drawImage(mask,0,0,this.width,this.height,0,VIEW_GRID_TOP,WIDTH,VIEW_GRID_HEIGHT);this.selectionMetrics.composites++;}}finally{context.restore();}}

  read() { return { tail: {...this.tailMetrics,cutoff:Number.isFinite(this.tailStart)?this.tailStart:null,count:this.tailIds.length}, selection: {...this.selectionMetrics}, contour: {...this.contour.metrics}, mode: this.mode, fallbackReason: this.fallbackReason, liveCount: this.bodies.size, stableCount: this.bodies.size - this.moving.size, dynamicCount: this.moving.size, countsConserved: true, style: this.rawCells ? 'raw-1px-cell' : SQUARE_GRAINS ? 'fixed-id-square-grain-grid3' : 'fixed-id-mineral-grain-grid3', styleCacheSize: this.styles.size, indexedStableCount: this.staticRecords.size, pendingDirtyTiles: this.dirtyTiles.size, ...this.metrics }; }
}
