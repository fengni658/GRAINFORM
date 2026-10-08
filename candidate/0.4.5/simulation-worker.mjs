import { Game } from './game.mjs';

// Physics is exclusively owned by this worker. One callback advances exactly one
// fixed 1/120 s step. Late callbacks never create a catch-up queue or skip a step.
const STEP_MS = 1000 / 120;
const SNAPSHOT_MS = 1000 / 30;
let game = null, timer = null, nextDue = 0, hidden = false, failed = false;
let lastSnapshotAt = -Infinity, steps = 0, epoch = 0;
let stepTotalMs = 0, stepMaxMs = 0, lastStepMs = 0, commandMaxMs = 0;
let runningSince = 0, activeWallMs = 0, simMs = 0, recent = [];
let lastCommandId = 0, lastCommand = null;
const now = () => performance.now();

function stopClock() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  if (runningSince) { activeWallMs += now() - runningSince; runningSince = 0; }
}
function wallMs() { return activeWallMs + (runningSince ? now() - runningSince : 0); }
function resetMetrics() {
  steps = 0; simMs = 0; stepTotalMs = 0; stepMaxMs = 0; lastStepMs = 0;
  commandMaxMs = 0; activeWallMs = 0; runningSince = 0; recent = [];
}
function stats() {
  const wall = wallMs(), sim = simMs;
  // A bounded two-second wall-time window, reset on resume to exclude pauses.
  recent.push({ wall, sim });
  while (recent.length > 2 && wall - recent[1].wall > 2000) recent.shift();
  if (recent.length > 120) recent.splice(0, recent.length - 120);
  const first = recent[0], duration = wall - first.wall;
  const rate = duration > 150 ? Math.min(1, (sim - first.sim) / duration) : null;
  return {
    fixedDt: 1 / 120, scheduler: 'one-step-no-catchup', maxBatchSteps: 1,
    pendingTimers: timer === null ? 0 : 1, steps, simSeconds: sim / 1000,
    activeWallSeconds: wall / 1000, wallMinusSimSeconds: Math.max(0, wall - sim) / 1000,
    recentRate: rate, slowdown: rate !== null && rate < .86,
    meanStepMs: steps ? stepTotalMs / steps : 0, maxStepMs: stepMaxMs,
    lastStepMs, maxCommandMs: commandMaxMs, lastCommandId, lastCommand,
    hidden, snapshotHzLimit: 30, epoch
  };
}
function publish(force = false) {
  const t = now();
  if (!game || (!force && t - lastSnapshotAt < SNAPSHOT_MS)) return;
  const snapshot = game.snapshot();
  const diagnostics = stats();
  postMessage({ type: 'snapshot', snapshot, diagnostics, sentAt: t, epoch });
  lastSnapshotAt = now();
}
function schedule() {
  if (timer !== null || !game || game.state !== 'playing' || hidden || failed) return;
  timer = setTimeout(pump, Math.max(0, nextDue - now()));
}
function startClock() {
  if (!game || game.state !== 'playing' || hidden || failed) return;
  if (!runningSince) runningSince = now();
  recent = [{ wall: wallMs(), sim: simMs }];
  nextDue = now() + STEP_MS;
  schedule();
}
function fatal(error) {
  failed = true;
  stopClock();
  postMessage({ type: 'fatal', message: String(error?.message || error), epoch });
}
function pump() {
  timer = null;
  if (!game || game.state !== 'playing' || hidden || failed) return;
  const begun = now();
  // Timer resolution may wake early. Do not advance physics ahead of its clock.
  if (begun + .01 < nextDue) { schedule(); return; }
  try {
    const advanced = game.step();
    lastStepMs = now() - begun;
    stepTotalMs += lastStepMs; stepMaxMs = Math.max(stepMaxMs, lastStepMs);
    if (advanced) { steps++; simMs += STEP_MS; }
    // Rebase to the actual start, not an overdue deadline: no accumulated debt.
    nextDue = begun + STEP_MS;
    if (game.state !== 'playing') { stopClock(); publish(true); }
    else { publish(); schedule(); }
  } catch (error) { fatal(error); }
}
function init({ seed = 1, solver = 'baseline' } = {}) {
  stopClock(); failed = false; epoch++; resetMetrics();
  game = new Game({ seed: seed >>> 0, solver: solver === 'adaptive' ? 'adaptive' : 'baseline' });
  lastSnapshotAt = -Infinity;
  publish(true);
}
function perform(name, value) {
  if (!game) throw new Error('Game has not been initialized');
  switch (name) {
    case 'start': { const ok = game.start(); if (hidden) game.pause(); startClock(); return ok; }
    case 'pause': { const ok = game.pause(); stopClock(); return ok; }
    case 'resume': { if (hidden) return false; const ok = game.resume(); startClock(); return ok; }
    case 'restart': { const solver = game.solver; init({ seed: value?.seed ?? 1, solver }); const ok = game.start(); if (hidden) game.pause(); startClock(); return ok; }
    case 'left': return game.move(-24);
    case 'right': return game.move(24);
    case 'move': return game.move(Math.max(-48, Math.min(48, Number(value) || 0)));
    case 'rotate': return game.rotate();
    case 'drop': return game.drop();
    case 'down': case 'softDrop': return game.softDrop();
    case 'snapshot': return true;
    default: throw new Error(`Unknown command: ${name}`);
  }
}
onmessage = ({ data }) => {
  if (!data || typeof data !== 'object') return;
  try {
    if (data.type === 'init') { init(data); postMessage({ type: 'ready', epoch }); return; }
    if (data.type === 'visibility') {
      hidden = !!data.hidden;
      if (hidden && game) { game.pause(); stopClock(); publish(true); }
      // A visible document stays paused until explicit user resume.
      postMessage({ type: 'visibility', hidden, state: game?.state, epoch });
      return;
    }
    if (data.type !== 'command' || !Number.isInteger(data.id)) return;
    if (failed) { postMessage({ type: 'ack', id: data.id, error: 'Simulation stopped after an error', epoch }); return; }
    if (data.epoch !== undefined && data.epoch !== epoch && ['left', 'right', 'move', 'rotate', 'drop', 'down', 'softDrop'].includes(data.name)) {
      postMessage({ type: 'ack', id: data.id, name: data.name, applied: false, reason: 'stale-round', state: game.state, tick: steps, epoch }); return;
    }
    const begun = now();
    const applied = perform(data.name, data.value);
    commandMaxMs = Math.max(commandMaxMs, now() - begun);
    lastCommandId = data.id; lastCommand = data.name;
    postMessage({ type: 'ack', id: data.id, name: data.name, applied: !!applied, state: game.state, tick: steps, epoch });
    publish(['start', 'restart', 'pause', 'resume', 'snapshot'].includes(data.name));
  } catch (error) {
    postMessage({ type: 'ack', id: data.id, name: data.name, error: String(error?.message || error), epoch });
    fatal(error);
  }
};
