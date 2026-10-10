import { Game, SHAPES } from './game.mjs';

export const CLOCK_CONTRACT = Object.freeze({ stepMs: 1000 / 60, fixedDt: 1 / 60, maxBatchSteps: 8, callbackSoftMs: 6, publishMs: 1000 / 60, stablePublishMs: 1000 / 30 });
/** Injected clock/timers make the real worker scheduler directly testable in Node.
 * Debt is never rebased or clipped. Only explicit restart resets it; active pause
 * and hidden time are excluded, while already owed ticks remain pending. */
export function createSimulationRuntime({ GameType = Game, now = () => performance.now(), timeOrigin = performance.timeOrigin, setTimer = setTimeout, clearTimer = clearTimeout, post = message => postMessage(message) } = {}) {
  const C = CLOCK_CONTRACT;
  let game = null, timer = null, hidden = false, failed = false, epoch = 0, sequence = 0, qaEnabled = false, qaFixture = null;
  let running = false, lastWall = null, debtMs = 0, activeWallMs = 0, simMs = 0, steps = 0;
  let lastPublish = -Infinity, stepTotalMs = 0, maxStepMs = 0, lastStepMs = 0, maxCommandMs = 0, lastCommandId = 0, lastCommand = null;
  let lastBatchSteps = 0, maxObservedBatchSteps = 0, fullSyncs = 0, deltaFrames = 0, recent = [];
  const materialFrames = new Map();
  let lastMaterialToken = 0, presentedToken = 0, rejectedPresentationAcks = 0, maxPendingMaterialFrames = 0, messageBytes = 0, lastMessageBytes = 0, messageSerializationMs = 0, maxPostMessageMs = 0, postMessageMs = 0;
  const commandAcks = new Map(), stepHistogram=new Uint32Array(501);
  function stepP95(){let count=0;for(let i=0;i<stepHistogram.length;i++){count+=stepHistogram[i];if(count>=steps*.95)return i===500?maxStepMs:(i+1)/10;}return 0;}
  function accrue() { const t = now(); if (running && lastWall !== null) { const dt = t - lastWall; if (dt < 0) throw Error('Non-monotonic worker clock'); debtMs += dt; activeWallMs += dt; } if (running) lastWall = t; return t; }
  function stopClock() { accrue(); running = false; lastWall = null; if (timer !== null) clearTimer(timer); timer = null; }
  function presentationBlocked() { return materialFrames.size >= 2 || (game?.awaitingPresentation && game?.world?.chunks?.size === 0); }
  function publicationInterval(){return game?.world?.stats?.().active===0&&!game?.clearTimer?C.stablePublishMs:C.publishMs;}
  function stats() {
    accrue(); recent.push({ wall: activeWallMs, sim: simMs });
    while (recent.length > 2 && activeWallMs - recent[1].wall > 2000) recent.shift();
    if (recent.length > 120) recent.splice(0, recent.length - 120);
    const first = recent[0], elapsed = activeWallMs - first.wall, rate = elapsed > 150 ? (simMs - first.sim) / elapsed : null;
    return { fixedDt: C.fixedDt, scheduler: 'fixed-60hz-retained-accumulator', maxBatchSteps: C.maxBatchSteps, callbackSoftMs: C.callbackSoftMs,
      pendingTimers: timer === null ? 0 : 1, steps, simSeconds: simMs / 1000, activeWallSeconds: activeWallMs / 1000,
      debtSeconds: debtMs / 1000, debtSteps: Math.floor((debtMs + 1e-7) / C.stepMs), wallMinusSimSeconds: (activeWallMs - simMs) / 1000,
      clockConservationErrorMs: activeWallMs - simMs - debtMs, recentRate: rate, slowdown: debtMs > 250,
      meanStepMs: steps ? stepTotalMs / steps : 0, stepP95Ms: steps?stepP95():0, stepHistogramResolutionMs:.1, sandActive:game?.world?.stats?.().active??0, sandVisits:game?.world?.stats?.().lastTick.visits??0, maxStepMs, lastStepMs, maxCommandMs, lastCommandId, lastCommand,
      lastBatchSteps, maxObservedBatchSteps, hidden, running, snapshotHzLimit: 1000/publicationInterval(), epoch, sequence, fullSyncs, deltaFrames, qaEnabled, pendingMaterialFrames: materialFrames.size, maxPendingMaterialFrames, presentationBlocked: presentationBlocked(), presentedToken, rejectedPresentationAcks, messageBytes, lastMessageBytes, messageByteMeasurement: qaEnabled ? 'UTF-8 JSON payload, measured before structured clone' : 'disabled outside QA', messageSerializationMs, postMessageMs, maxPostMessageMs };
  }
  function publish({ force = false, full = false } = {}) {
    const t = now(),interval=publicationInterval(); if (!game || (!force && t - lastPublish < interval)) return false;
    const frame = game.frame({ full }); const patch = frame.bodyPatch; delete frame.bodyPatch; if (qaFixture) frame.qaFixture = { ...qaFixture };
    if (!patch || patch.reset !== full) throw Error('Grid adapter returned an invalid incremental frame');
    const previousSequence = sequence; sequence++;
    if (full) fullSyncs++; else deltaFrames++;
    const material = frame.materialFrame;
    delete frame.materialFrame;
    if (material && material.token > lastMaterialToken) {
      if (materialFrames.size >= 2) throw Error('More than two unpresented material frames');
      materialFrames.set(material.token, material); lastMaterialToken = material.token;
      maxPendingMaterialFrames = Math.max(maxPendingMaterialFrames, materialFrames.size);
      frame.materialFrame = material;
    }
    const packet = { type: 'snapshot', mode: full ? 'full' : 'delta', snapshot: frame, bodyPatch: patch, seq: sequence, baseSeq: full ? null : previousSequence, diagnostics: stats(), sentAt: now(), sentTimeOrigin: timeOrigin, epoch };
    if (full) packet.presentationFrames = [...materialFrames.values()];
    if (qaEnabled) { const begin = now(); lastMessageBytes = new TextEncoder().encode(JSON.stringify(packet)).byteLength; messageBytes += lastMessageBytes; messageSerializationMs += now() - begin; }
    const sendBegin = now(); post(packet); postMessageMs = now() - sendBegin; maxPostMessageMs = Math.max(maxPostMessageMs, postMessageMs);
    lastPublish = force?t:lastPublish+Math.floor((t-lastPublish)/interval)*interval; return true;
  }
  function schedule() { if (timer !== null || !running || !game || game.state !== 'playing' || hidden || failed || presentationBlocked()) return; accrue(); timer = setTimer(pump, Math.max(0, debtMs + 1e-7 >= C.stepMs ? 0 : C.stepMs - debtMs)); }
  function startClock() { if (!game || game.state !== 'playing' || hidden || failed) return; if (!running) { running = true; lastWall = now(); recent = [{ wall: activeWallMs, sim: simMs }]; } schedule(); }
  function fatal(error) { failed = true; stopClock(); post({ type: 'fatal', message: String(error?.message || error), epoch }); }
  function pump() {
    timer = null; if (!running || !game || game.state !== 'playing' || hidden || failed) return;
    const callbackStart = accrue(); lastBatchSteps = 0;
    try {
      while (debtMs + 1e-7 >= C.stepMs && lastBatchSteps < C.maxBatchSteps && !presentationBlocked()) {
        if (lastBatchSteps > 0 && now() - callbackStart >= C.callbackSoftMs) break;
        const beforeTick = game.gameTick, t = now(), advanced = game.step();
        lastStepMs = now() - t; stepHistogram[Math.min(500,Math.floor(lastStepMs*10))]++; stepTotalMs += lastStepMs; maxStepMs = Math.max(maxStepMs, lastStepMs);
        // A final game-over tick still consumed control time if gameTick advanced.
        if (advanced || (Number.isFinite(beforeTick) && game.gameTick > beforeTick)) { steps++; simMs += C.stepMs; debtMs -= C.stepMs; if (debtMs < 0 && debtMs > -1e-7) debtMs = 0; lastBatchSteps++; }
        else if (game.state === 'playing') throw Error('Playing Game.step did not advance a control tick');
        if ((game.presentationToken ?? 0) > lastMaterialToken) publish({ force: true });
        if (game.state !== 'playing') { stopClock(); break; }
      }
      maxObservedBatchSteps = Math.max(maxObservedBatchSteps, lastBatchSteps); accrue();
      publish({ force: game.state !== 'playing' }); schedule();
    } catch (error) { fatal(error); }
  }
  function resetMetrics() { materialFrames.clear(); lastMaterialToken = presentedToken = rejectedPresentationAcks = maxPendingMaterialFrames = messageBytes = lastMessageBytes = messageSerializationMs = maxPostMessageMs = postMessageMs = 0; stepHistogram.fill(0); debtMs = activeWallMs = simMs = steps = stepTotalMs = maxStepMs = lastStepMs = maxCommandMs = 0; lastCommandId = 0; lastCommand = null; lastBatchSteps = maxObservedBatchSteps = fullSyncs = deltaFrames = 0; recent = []; sequence = 0; commandAcks.clear(); }
  function init({ seed = 1, qa = false } = {}) { stopClock(); failed = false; qaEnabled = qa === true; qaFixture = null; epoch++; resetMetrics(); game = new GameType({ seed: seed >>> 0, solver: 'grid' }); lastPublish = -Infinity; publish({ force: true, full: true }); }
  function perform(name, value) {
    if (!game) throw Error('Game has not been initialized');
    switch (name) {
      case 'start': { const ok = game.start(); if (hidden) game.pause(); startClock(); return ok; }
      case 'pause': { const ok = game.pause(); stopClock(); return ok; }
      case 'resume': { if (hidden) return false; const ok = game.resume(); startClock(); return ok; }
      case 'restart': { init({ seed: value?.seed ?? 1, qa: qaEnabled }); const ok = game.start(); if (hidden) game.pause(); startClock(); return ok; }
      case 'qa-bridge': {
        if (!qaEnabled) return false;
        init({ seed: value?.seed ?? 1, qa: true });
        const admit = points => { const result = game.world.addMany(points); if (!result.accepted) throw Error('QA cell fixture admission failed'); return result.addedIds; };
        if (value?.fixture === 'capacity') {
          game.world.maxParticles = 2303; game.start(); if (hidden) game.pause();
          qaFixture = { name: 'artificial-capacity-2303', artificial: true, source: 'QA capacity boundary, no material admission' }; startClock(); return true;
        }
        if (value?.fixture === 'early-clear') {
          const base = Array.from({ length: 232 }, (_, x) => ({ x: 28 + x, y: 419, color: 1 })).filter(p => p.x < 120 || p.x >= 168);
          admit(base); game.world.step(); game.world.completePresentation(); if (game.world.chunks.size) throw Error('QA floor must settle before spawning'); game.added = base.length; game.next = { shape: SHAPES[0].map(p => p.slice()), color: 1 }; game.start(); game.active.x = 120;
          if (hidden) game.pause(); qaFixture = { name: 'early-clear-gap-real-O-drop', artificial: true, added: base.length, source: 'Artificial base; drop and settling run normal gameplay' }; startClock(); return true;
        }
        const bottom = Array.from({ length: 232 }, (_, x) => ({ x: 28 + x, y: 419, color: 1 }));
        admit(bottom);
        let added = 232;
        if (value?.fixture === 'cascade') {
          for (const y of [418, 416]) { const sides = Array.from({ length: 232 }, (_, x) => ({ x: 28 + x, y, color: 2 })).filter(p => p.x !== 144); admit(sides); admit([{x:144,y,color:1}]); }
          admit(Array.from({ length: 232 }, (_, x) => ({ x: 28 + x, y: 417, color: 1 }))); added += 696;
        } else { const supported = Array.from({ length: 40 }, (_, i) => ({ x: 124 + i, y: 418, color: 2 })); admit(supported); added += supported.length; }
        game.added = added; game.active = null; game.world.pendingInbound = 0; game.setPhase('settling'); game.spawnDelay = 0; game.state = hidden ? 'paused' : 'playing';
        qaFixture = { name: value?.fixture === 'cascade' ? 'artificial-cell-support-cascade' : 'artificial-cell-bottom-bridge', artificial: true, added, bridgeGrains: 232, supportedGrains: added - 232, source: 'Explicit QA cell placement, not natural gameplay' };
        startClock(); return true;
      }
      case 'left': return game.move(-24);
      case 'right': return game.move(24);
      case 'move': return game.move(Math.max(-48, Math.min(48, Number(value) || 0)));
      case 'rotate': return game.rotate();
      case 'drop': return game.drop();
      case 'down': case 'softDrop': return game.softDrop();
      case 'snapshot': return true;
      default: throw Error(`Unknown command: ${name}`);
    }
  }
  function receive(data) {
    if (!data || typeof data !== 'object') return;
    try {
      if (data.type === 'init') { hidden = !!data.hidden; init(data); post({ type: 'ready', epoch }); return; }
      if (data.type === 'presented') {
        if (data.epoch !== epoch || data.token !== materialFrames.keys().next().value || !game?.completePresentation?.(data.token)) { rejectedPresentationAcks++; return; }
        accrue(); materialFrames.delete(data.token); presentedToken = data.token; schedule(); return;
      }
      if (data.type === 'visibility') {
        if (data.epoch !== epoch) return;
        accrue(); hidden = !!data.hidden; if (hidden && game) { game.pause(); stopClock(); publish({ force: true }); }
        post({ type: 'visibility', hidden, state: game?.state, epoch }); return;
      }
      if (data.type === 'resync') { if (data.epoch !== undefined && data.epoch !== epoch) return; publish({ force: true, full: true }); return; }
      if (data.type !== 'command' || !Number.isInteger(data.id)) return;
      if (data.epoch !== epoch) { post({ type: 'ack', id: data.id, name: data.name, applied: false, reason: data.epoch === undefined ? 'missing-epoch' : 'stale-round', state: game?.state, tick: steps, epoch }); return; }
      if (commandAcks.has(data.id)) { post(commandAcks.get(data.id)); return; }
      if (data.name === 'qa-bridge' && !qaEnabled) { post({ type: 'ack', id: data.id, name: data.name, applied: false, reason: 'qa-disabled', state: game?.state, epoch }); return; }
      if (failed) { post({ type: 'ack', id: data.id, error: 'Simulation stopped after an error', epoch }); return; }
      accrue();
      const input = ['left','right','move','rotate','drop','down','softDrop'].includes(data.name);
      if (input && Number.isInteger(game?.pieceId) && (data.pieceId !== game.pieceId || !game.acceptsInput())) {
        const ack = { type:'ack',id:data.id,name:data.name,applied:false,reason:data.pieceId!==game.pieceId?'stale-piece':'inactive-phase',state:game.state,tick:steps,epoch,pieceId:game.pieceId };
        commandAcks.set(data.id,ack); if(commandAcks.size>128)commandAcks.delete(commandAcks.keys().next().value);post(ack);return;
      }
      const previousState = game?.state, previousPhase = game?.phase, begun = now(), applied = perform(data.name, data.value);
      if (game.state !== 'playing') stopClock(); maxCommandMs = Math.max(maxCommandMs, now() - begun); lastCommandId = data.id; lastCommand = data.name;
      const ack = { type: 'ack', id: data.id, name: data.name, applied: !!applied, state: game.state, tick: steps, epoch, pieceId:game.pieceId }; commandAcks.set(data.id, ack); if (commandAcks.size > 128) commandAcks.delete(commandAcks.keys().next().value); post(ack);
      publish({ force: previousState !== game.state || previousPhase !== game.phase || game.state !== 'playing' || ['start', 'restart', 'pause', 'resume', 'snapshot', 'qa-bridge'].includes(data.name), full: data.name === 'snapshot' || data.name === 'qa-bridge' }); schedule();
    } catch (error) { post({ type: 'ack', id: data.id, name: data.name, error: String(error?.message || error), epoch }); fatal(error); }
  }
  return { receive, stats, pump, get game() { return game; }, get epoch() { return epoch; }, dispose() { stopClock(); } };
}
if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof document === 'undefined') { const runtime = createSimulationRuntime(); self.onmessage = ({ data }) => runtime.receive(data); }
