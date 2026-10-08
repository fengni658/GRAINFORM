/** CPU-only correctness contract. This module neither edits nor runs the GPU core. */
export const CONTRACT = Object.freeze({
  cell: 4, originX: 28, originY: -16, cols: 58, rows: 110,
  capacity: 16, layers: 17, maxSlot: 1048575, maxAnchorAxisMotionExclusive: 4,
});
export class ContractError extends Error {
  constructor(code, message) { super(message); this.name = 'ContractError'; this.code = code; }
}
const fail = (code, message) => { throw new ContractError(code, message); };
export const cellOf = p => ({ x: Math.floor((p.x - CONTRACT.originX) / CONTRACT.cell), y: Math.floor((p.y - CONTRACT.originY) / CONTRACT.cell) });
const inGrid = c => c.x >= 0 && c.x < CONTRACT.cols && c.y >= 0 && c.y < CONTRACT.rows;
const cellIndex = c => c.y * CONTRACT.cols + c.x;
const offset = (c, rank) => cellIndex(c) * CONTRACT.layers + rank;
const sameCell = (a, b) => a.x === b.x && a.y === b.y;
const clone = records => records.map(p => ({...p}));
function validateRecords(records) {
  if (!Array.isArray(records)) fail('records-not-array', 'Records must be an array.');
  const slots = new Set();
  return records.map(p => {
    if (!p || !Number.isInteger(p.slot) || p.slot < 0 || p.slot > CONTRACT.maxSlot) fail('invalid-slot', 'Slot must be a bounded nonnegative stable integer.');
    if (slots.has(p.slot)) fail('duplicate-slot', `Repeated stable slot ${p.slot}.`);
    slots.add(p.slot);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) fail('nonfinite-position', `Slot ${p.slot} must have finite coordinates.`);
    return {...p, id: p.id ?? p.slot, alive: p.alive !== false};
  });
}
function diagnostics({overflow = false, outOfGrid = false, nonfinite = false, driftExceeded = false, invalid = false} = {}) {
  return {overflow, outOfGrid, nonfinite, driftExceeded, invalid: invalid || overflow || outOfGrid || nonfinite || driftExceeded};
}
function emptyGrid(anchors, inherited) {
  return {anchors:clone(anchors), buckets:new Uint32Array(CONTRACT.cols * CONTRACT.rows * CONTRACT.layers), counts:new Uint32Array(CONTRACT.cols * CONTRACT.rows), ranks:[], beyondWitnessSlots:[], diagnostics:diagnostics(inherited)};
}
function scatter(grid, p, cell, rank) {
  grid.ranks.push({slot:p.slot, cellX:cell.x, cellY:cell.y, rank});
  if (rank >= CONTRACT.layers) { grid.beyondWitnessSlots.push(p.slot); return; }
  const at = offset(cell, rank);
  if (grid.buckets[at] !== 0) fail('scatter-conflict', `Two particles wrote cell ${cell.x},${cell.y}, rank ${rank}.`);
  grid.buckets[at] = p.slot + 1;
}
function finish(grid) {
  grid.diagnostics.overflow ||= grid.counts.some(count => count > CONTRACT.capacity);
  grid.diagnostics.invalid ||= grid.diagnostics.overflow || grid.diagnostics.outOfGrid;
  return grid;
}

/** Independent direct sort oracle, also the conceptual full 17-peel rebuild fallback. */
export function directSortGrid(input, inheritedDiagnostics) {
  const records = validateRecords(input), grid = emptyGrid(records, inheritedDiagnostics);
  const active = records.filter(p => p.alive).map(p => ({p, cell:cellOf(p)}));
  for (const item of active) if (!inGrid(item.cell)) grid.diagnostics.outOfGrid = true;
  active.sort((a,b) => cellIndex(a.cell) - cellIndex(b.cell) || a.p.slot - b.p.slot);
  for (const {p,cell} of active) {
    if (!inGrid(cell)) continue; // Explicit invalidity; never claim this is a complete valid grid.
    const rank = grid.counts[cellIndex(cell)]++;
    scatter(grid, p, cell, rank);
  }
  return finish(grid);
}

/** Validate old complete, non-overflowing, sorted buckets without using the sort oracle. */
export function validateOldGrid(old) {
  if (!old || !old.diagnostics || ['invalid','overflow','outOfGrid','nonfinite','driftExceeded'].some(flag => typeof old.diagnostics[flag] !== 'boolean')) return {ok:false, reason:'old-validity-unproven'};
  if (old.diagnostics?.invalid || old.diagnostics?.overflow || old.diagnostics?.outOfGrid || old.diagnostics?.nonfinite || old.diagnostics?.driftExceeded) return {ok:false, reason:'old-invalid'};
  let records;
  try { records = validateRecords(old.anchors); } catch (error) { return {ok:false, reason:`old-${error.code}`}; }
  if (!(old.buckets instanceof Uint32Array) || old.buckets.length !== CONTRACT.cols * CONTRACT.rows * CONTRACT.layers) return {ok:false, reason:'old-bucket-shape'};
  const bySlot = new Map(records.map(p => [p.slot,p])), seen = new Set();
  for (let y=0; y<CONTRACT.rows; y++) for (let x=0; x<CONTRACT.cols; x++) {
    const cell = {x,y}; let gap = false, previous = -1;
    for (let rank=0; rank<CONTRACT.layers; rank++) {
      const code = old.buckets[offset(cell,rank)];
      if (!code) { gap = true; continue; }
      if (rank === CONTRACT.capacity) return {ok:false, reason:'old-overflow-witness'};
      if (gap) return {ok:false, reason:'old-bucket-gap'};
      const slot = code-1, p = bySlot.get(slot);
      if (seen.has(slot)) return {ok:false, reason:'old-duplicate-slot'};
      if (slot <= previous) return {ok:false, reason:'old-bucket-order'};
      if (!p || !p.alive || !sameCell(cellOf(p),cell)) return {ok:false, reason:'old-bucket-membership'};
      seen.add(slot); previous = slot;
    }
  }
  for (const p of records) if (p.alive && !seen.has(p.slot)) return {ok:false, reason:'old-missing-live-slot'};
  return {ok:true, bySlot};
}

/**
 * All-or-nothing decision: rank only if every live next slot has a valid old anchor
 * and strict per-axis old-anchor -> next-anchor motion < 4. A failed proof never
 * mixes partial scatter with a fallback. Explicit dead tombstones model deletion.
 */
export function rankOrRebuild(old, input, {onUnproven='fallback'} = {}) {
  if (!['fallback','reject'].includes(onUnproven)) fail('invalid-policy', 'onUnproven must be fallback or reject.');
  const next = validateRecords(input), nextBySlot = new Map(next.map(p => [p.slot,p]));
  const validity = validateOldGrid(old);
  if (!validity.ok) return {mode:'rejected', reason:validity.reason, diagnostics:diagnostics({...old?.diagnostics, invalid:true})};
  const oldBySlot = validity.bySlot;
  for (const p of old.anchors) if (!nextBySlot.has(p.slot)) return {mode:'rejected', reason:'missing-slot-tombstone', slot:p.slot, diagnostics:diagnostics({invalid:true})};
  for (const p of next) if (p.alive && !inGrid(cellOf(p))) return {mode:'rejected', reason:'next-out-of-grid', slot:p.slot, diagnostics:diagnostics({...old.diagnostics, outOfGrid:true})};
  const unproven = [], proof = {maxAbsDx:0, maxAbsDy:0, strictLimit:4, checkedLiveSlots:0};
  for (const p of next) {
    if (!p.alive) continue;
    const previous = oldBySlot.get(p.slot);
    if (!previous || !previous.alive || previous.id !== p.id) { unproven.push({slot:p.slot, reason:!previous?'new-slot':!previous.alive?'resurrected-slot':'reused-slot'}); continue; }
    const dx = p.x-previous.x, dy = p.y-previous.y;
    proof.maxAbsDx = Math.max(proof.maxAbsDx, Math.abs(dx)); proof.maxAbsDy = Math.max(proof.maxAbsDy, Math.abs(dy)); proof.checkedLiveSlots++;
    if (!(Math.abs(dx)<4 && Math.abs(dy)<4)) unproven.push({slot:p.slot, reason:'anchor-motion-unproven', dx, dy});
  }
  if (unproven.length) {
    if (onUnproven === 'reject') return {mode:'rejected', reason:'rank-proof-unavailable', unproven, proof, diagnostics:diagnostics({invalid:true})};
    return {mode:'full-rebuild', reason:'rank-proof-unavailable', unproven, proof, grid:directSortGrid(next,old.diagnostics)};
  }
  const grid = emptyGrid(next,old.diagnostics);
  let examinedBucketEntries=0;
  for (const p of next) {
    if (!p.alive) continue;
    const target = cellOf(p); let rank=0, selfCount=0;
    for (let oy=-1; oy<=1; oy++) for (let ox=-1; ox<=1; ox++) {
      const cell = {x:target.x+ox,y:target.y+oy};
      if (!inGrid(cell)) continue;
      for (let k=0; k<CONTRACT.capacity; k++) {
        const code = old.buckets[offset(cell,k)]; examinedBucketEntries++;
        if (code === 0) break;
        const otherSlot=code-1, q=nextBySlot.get(otherSlot);
        if (!q?.alive || !sameCell(cellOf(q),target)) continue;
        if (otherSlot === p.slot) selfCount++;
        if (otherSlot < p.slot) rank++;
      }
    }
    if (selfCount !== 1) fail('missing-or-duplicate-self', `Slot ${p.slot} appeared ${selfCount} times in its old neighborhood.`);
    grid.counts[cellIndex(target)]++;
    scatter(grid,p,target,rank);
  }
  return {mode:'rank', grid:finish(grid), proof, examinedBucketEntries};
}

/** Pixel destination matching the existing even/odd 9-layer atlases. */
export function atlasAddress(cellX,cellY,rank) {
  if (!inGrid({x:cellX,y:cellY}) || !Number.isInteger(rank) || rank<0 || rank>=CONTRACT.layers) fail('invalid-atlas-address','Only grid cells and rank 0..16 have an atlas address.');
  return {parity:rank%2, x:cellX, y:Math.floor(rank/2)*CONTRACT.rows+cellY};
}

/** Sufficient analytic bound only when BOTH per-axis predicted displacements are proved. */
export function conditionalAnchorBound({maxFinalDrift, maxPredictedAbsDx, maxPredictedAbsDy}) {
  const values=[maxFinalDrift,maxPredictedAbsDx,maxPredictedAbsDy];
  if (!values.every(v=>Number.isFinite(v)&&v>=0)) return {proven:false,reason:'missing-finite-nonnegative-bound'};
  const maxAbsDx=maxFinalDrift+maxPredictedAbsDx, maxAbsDy=maxFinalDrift+maxPredictedAbsDy;
  return {proven:maxAbsDx<4&&maxAbsDy<4,maxAbsDx,maxAbsDy,strictLimit:4};
}
