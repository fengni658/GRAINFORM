import {LEFT,FLOOR,FIELD_WIDTH,FIELD_HEIGHT} from './board-geometry.mjs';
import { Game, SHAPES } from './game.mjs';
import {CompositeBuilder} from './composite-protocol.mjs';
import {SNAPSHOT_WIRE_BUDGET} from './snapshot-transport.mjs';

export const CLOCK_CONTRACT = Object.freeze({ stepMs: 1000 / 60, fixedDt: 1 / 60, maxBatchSteps: 8, callbackSoftMs: 6, publishMs: 1000 / 60, stablePublishMs: 1000 / 30 });
/** Injected clock/timers make the real worker scheduler directly testable in Node.
 * Debt is never rebased or clipped. Only explicit restart resets it; active pause
 * and hidden time are excluded, while already owed ticks remain pending. */
export function createSimulationRuntime({ GameType = Game, now = () => performance.now(), timeOrigin = performance.timeOrigin, setTimer = setTimeout, clearTimer = clearTimeout, post = (message,transfer=[]) => postMessage(message,transfer) } = {}) {
  const C = CLOCK_CONTRACT;
  let game = null, timer = null, hidden = false, failed = false, epoch = 0, sequence = 0, qaEnabled = false, qaFixture = null;
  let running = false, lastWall = null, debtMs = 0, activeWallMs = 0, simMs = 0, steps = 0;
  let lastPublish = -Infinity, stepTotalMs = 0, maxStepMs = 0, lastStepMs = 0, maxCommandMs = 0, lastCommandId = 0, lastCommand = null;
  let lastBatchSteps = 0, maxObservedBatchSteps = 0, fullSyncs = 0, deltaFrames = 0, recent = [];
  const materialFrames = new Map(); // Kept as an alias ledger for legacy diagnostics only.
  let composite=null,lastRecordedToken=0,records=new Map(),pendingRemovals=new Set(),pendingFullSync=false;
  let checkpoint={epoch:0,groupId:0,token:0,ruleTick:0,controlTick:0,revision:0,burst:null,pieceId:null,quiet:false};
  const pointLimit=69*FIELD_WIDTH*FIELD_HEIGHT;
  // Canonical live-slot census, not the moving-path subset. Births must register
  // even particles that never move before being cleared in a later generation.
  const announcedIdentities=new Map();let announcedBurst=0;
  function mergePatches(frames){const upsert=new Map(),removed=new Set();for(const r of frames){for(const id of r.patch.removed){upsert.delete(id);removed.add(id);}for(const b of r.patch.upsert){removed.delete(b.id);upsert.set(b.id,b);}}return{reset:false,previousRevision:frames[0].patch.previousRevision,revision:frames.at(-1).patch.revision,upsert:[...upsert.values()],removed:[...removed]};}
  // One transferred, encoded snapshot owns transport credit until MAIN reception.
  // This is separate from authentic renderer presentation ACKs.
  let fullReceiptEpoch=0,transportOverlapSteps=0;
  let transportSerial=0,transportInFlight=null,transportQueue=[],transportEncodingMs=0,lastTransportEncodeMs=0,maxTransportEncodeMs=0,maxTransportBytes=0,rejectedTransportReceipts=0,coalescedFullRequests=0;
  function transmitNext(){
    if(transportInFlight||!transportQueue.length)return;
    const {frame,patch,full,groups}=transportQueue.shift();
    const previousSequence=sequence;sequence++;if(full)fullSyncs++;else deltaFrames++;
    frame.state=game.state;if(qaFixture)frame.qaFixture={...qaFixture};
    const packet={type:'snapshot',mode:full?'full':'delta',snapshot:frame,bodyPatch:patch,seq:sequence,baseSeq:full?null:previousSequence,diagnostics:stats(),sentAt:now(),sentTimeOrigin:timeOrigin,epoch,presentationGroups:groups};
    if(full)packet.presentationCheckpoint={...checkpoint};
    const begin=now(),bytes=new TextEncoder().encode(JSON.stringify(packet));lastTransportEncodeMs=now()-begin;transportEncodingMs+=lastTransportEncodeMs;maxTransportEncodeMs=Math.max(maxTransportEncodeMs,lastTransportEncodeMs);
    if(bytes.byteLength>SNAPSHOT_WIRE_BUDGET)throw Error('Snapshot exceeds production encoded-wire budget');
    const id=++transportSerial;transportInFlight={id,epoch,bytes:bytes.byteLength,kind:full?'full':groups.length===1?'material':'ordinary',groupId:groups.length===1?groups[0].groupId:null};maxTransportBytes=Math.max(maxTransportBytes,bytes.byteLength);
    lastMessageBytes=bytes.byteLength;messageBytes+=bytes.byteLength;
    const envelope={type:'snapshot-wire',transportId:id,epoch,byteLength:bytes.byteLength,buffer:bytes.buffer};
    const start=now();post(envelope,[bytes.buffer]);postMessageMs=now()-start;maxPostMessageMs=Math.max(maxPostMessageMs,postMessageMs);lastPublish=now();
  }
  function sendPacket(frame,patch,{full=false,groups=[]}={}){
    // Only material group records may wait here; ordinary/full snapshots are
    // deferred BEFORE game.frame consumes a patch. At most two group owners.
    if(transportQueue.length>=2)throw Error('Snapshot ownership queue exceeded two groups');
    transportQueue.push({frame,patch,full,groups});transmitNext();
  }
  function transportBlocked(){return !!transportInFlight||transportQueue.length>0;}
  function transportAllowsMaterialProgress(){
    // A received epoch baseline is mandatory. Never cross a resync or a new
    // lifecycle scope while its ownership is still being established.
    const wire=transportInFlight,g=composite?.pending[0];
    return !!wire && !transportQueue.length && fullReceiptEpoch===epoch && !pendingFullSync && !pendingRemovals.size &&
      wire.epoch===epoch && wire.kind==='material' && composite.pending.length===1 && wire.groupId===g.groupId && !g.quiet &&
      game?.state==='playing' && game.phase==='settling' && g.burst===game.settlingBurst && g.pieceId===game.pieceId && composite.canStep();
  }
  function serviceTransport(){transmitNext();if(!transportBlocked()&&pendingFullSync){if(publish({force:true,full:true}))pendingFullSync=false;}schedule();}
  function publishGroups(groups){for(const g of groups){const rs=g.frames.map(f=>records.get(f.token));if(rs.some(x=>!x))throw Error('Missing composite frame ownership');const frame={...rs.at(-1).snapshot,state:game.state};sendPacket(frame,mergePatches(rs),{groups:[g]});for(const f of g.frames)records.delete(f.token);maxPendingMaterialFrames=Math.max(maxPendingMaterialFrames,composite.pending.length);}}
  function recordMaterial(){if(game.presentationToken<=lastRecordedToken)return;const f=game.frame();const patch=f.bodyPatch,material=f.materialFrame;delete f.bodyPatch;delete f.materialFrame;records.set(material.token,{snapshot:f,patch});lastRecordedToken=material.token;
    const removedIds=[...new Set([...pendingRemovals,...patch.removed])];pendingRemovals.clear();
    const births=[];
    if(announcedBurst!==game.settlingBurst){
      const starts=new Map(material.paths.map(p=>[p.id,p.points]));
      for(const b of game.world.cache.values())if(announcedIdentities.get(b.id%game.world.live.length)!==b.id){const path=starts.get(b.id);births.push({id:b.id,x:path?path[0]:b.x,y:path?path[1]:b.y});}
    }
    const ready=composite.accept(material,{quiet:game.world.chunks.size===0,burst:game.settlingBurst,pieceId:game.pieceId,revision:game.world.revision,controlTick:game.gameTick,removedIds,births});
    for(const b of births)announcedIdentities.set(b.id%game.world.live.length,b.id);announcedBurst=game.settlingBurst;
    publishGroups(ready);
  }
  function flushPartial(){if(composite?.building.length&&composite.pending.length<2)publishGroups([composite.flush()]);}

  let lastMaterialToken = 0, presentedToken = 0, rejectedPresentationAcks = 0, maxPendingMaterialFrames = 0, messageBytes = 0, lastMessageBytes = 0, messageSerializationMs = 0, maxPostMessageMs = 0, postMessageMs = 0;
  const commandAcks = new Map(), stepHistogram=new Uint32Array(501);
  function stepP95(){let count=0;for(let i=0;i<stepHistogram.length;i++){count+=stepHistogram[i];if(count>=steps*.95)return i===500?maxStepMs:(i+1)/10;}return 0;}
  function accrue() { const t = now(); if (running && lastWall !== null) { const dt = t - lastWall; if (dt < 0) throw Error('Non-monotonic worker clock'); debtMs += dt; activeWallMs += dt; } if (running) lastWall = t; return t; }
  function stopClock() { accrue(); running = false; lastWall = null; if (timer !== null) clearTimer(timer); timer = null; }
  function presentationBlocked() { return (transportBlocked()&&!transportAllowsMaterialProgress())||!!composite&&(!composite.canStep()||(game?.awaitingPresentation&&game?.world?.chunks?.size===0)); }
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
      lastBatchSteps, maxObservedBatchSteps, hidden, running, snapshotHzLimit: 1000/publicationInterval(), epoch, sequence, fullSyncs, deltaFrames, qaEnabled, pendingMaterialFrames: composite?.pending.length??0, compositeBuildingFrames:composite?.building.length??0, retainedCanonicalPathPoints:composite?.usedPoints??0, hardCanonicalPointBudget:pointLimit*2, presentationContract:'K4 composite final endpoint, interior tick endpoints not individually exposed', maxPendingMaterialFrames, presentationBlocked: presentationBlocked(), presentedToken, rejectedPresentationAcks, messageBytes, lastMessageBytes, messageByteMeasurement:'exact transferred UTF-8 snapshot payload; control-envelope overhead and decoded heap excluded', transportOverlapSteps, epochFullReceiptReady:fullReceiptEpoch===epoch, transportOverlapAllowed:transportAllowsMaterialProgress(), transportWireBudget:SNAPSHOT_WIRE_BUDGET, transportInFlightBytes:transportInFlight?.bytes??0, transportInFlightCount:transportInFlight?1:0, transportQueuedOwners:transportQueue.length, maxTransportBytes, transportEncodingMs, lastTransportEncodeMs, maxTransportEncodeMs, rejectedTransportReceipts, coalescedFullRequests, messageSerializationMs, postMessageMs, maxPostMessageMs };
  }
  function publish({force=false,full=false}={}){
    if(!game)return false;
    if(transportBlocked()){if(full){pendingFullSync=true;coalescedFullRequests++;}return false;}
    if((full||game.state!=='playing')&&composite?.building.length)flushPartial();
    // Never expose bodies ahead of their unpublished paths. Pause control ACK is
    // independent; an exceptional full resync waits for resume/presentation credit.
    if(composite?.building.length||transportBlocked())return false;
    if(!force&&now()-lastPublish<publicationInterval())return false;
    const f=game.frame({full}),patch=f.bodyPatch;delete f.bodyPatch;delete f.materialFrame;
    for(const id of patch.removed)pendingRemovals.add(id);
    if(full&&lastRecordedToken===0)checkpoint={...checkpoint,ruleTick:game.world.tick,controlTick:game.gameTick,revision:patch.revision};
    sendPacket(f,patch,{full,groups:full?[...composite.pending]:[]});return true;
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
        const beforeTick = game.gameTick, overlappingTransport=transportBlocked(), t = now(), advanced = game.step();
        lastStepMs = now() - t; stepHistogram[Math.min(500,Math.floor(lastStepMs*10))]++; stepTotalMs += lastStepMs; maxStepMs = Math.max(maxStepMs, lastStepMs);
        // A final game-over tick still consumed control time if gameTick advanced.
        if (advanced || (Number.isFinite(beforeTick) && game.gameTick > beforeTick)) { if(overlappingTransport)transportOverlapSteps++; steps++; simMs += C.stepMs; debtMs -= C.stepMs; if (debtMs < 0 && debtMs > -1e-7) debtMs = 0; lastBatchSteps++; }
        else if (game.state === 'playing') throw Error('Playing Game.step did not advance a control tick');
        recordMaterial();
        if (game.state !== 'playing') { stopClock(); break; }
      }
      maxObservedBatchSteps = Math.max(maxObservedBatchSteps, lastBatchSteps); accrue();
      publish({ force: game.state !== 'playing' }); schedule();
    } catch (error) { fatal(error); }
  }
  function resetMetrics() { materialFrames.clear(); lastMaterialToken = presentedToken = rejectedPresentationAcks = maxPendingMaterialFrames = messageBytes = lastMessageBytes = messageSerializationMs = maxPostMessageMs = postMessageMs = 0; stepHistogram.fill(0); debtMs = activeWallMs = simMs = steps = stepTotalMs = maxStepMs = lastStepMs = maxCommandMs = 0; lastCommandId = 0; lastCommand = null; lastBatchSteps = maxObservedBatchSteps = fullSyncs = deltaFrames = 0; recent = []; sequence = 0; commandAcks.clear(); }
  function init({ seed = 1, qa = false } = {}) { stopClock(); failed = false; qaEnabled = qa === true; qaFixture = null; epoch++; fullReceiptEpoch=0;transportOverlapSteps=0; resetMetrics(); game = new GameType({ seed: seed >>> 0, solver: 'grid' }); lastPublish=-Infinity;lastRecordedToken=0;announcedIdentities.clear();announcedBurst=0;records.clear();pendingRemovals.clear();transportQueue=[];pendingFullSync=false;composite=new CompositeBuilder({epoch,maxFramePoints:pointLimit,softPoints:262144,hardPoints:pointLimit*2});checkpoint={epoch,groupId:0,token:0,ruleTick:0,controlTick:0,revision:0,burst:null,pieceId:null,quiet:false};publish({force:true,full:true}); }
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
          const base = Array.from({ length: FIELD_WIDTH }, (_, x) => ({ x: LEFT + x, y: FLOOR-1, color: 1 })).filter(p => p.x < 120 || p.x >= 168);
          admit(base); game.world.step(); game.world.completePresentation(); if (game.world.chunks.size) throw Error('QA floor must settle before spawning'); game.added = base.length; game.next = { shape: SHAPES[0].map(p => p.slice()), color: 1 }; game.start(); game.active.x = 120;
          if (hidden) game.pause(); qaFixture = { name: 'early-clear-gap-real-O-drop', artificial: true, added: base.length, source: 'Artificial base; drop and settling run normal gameplay' }; startClock(); return true;
        }
        const bottom = Array.from({ length: FIELD_WIDTH }, (_, x) => ({ x: LEFT + x, y: FLOOR-1, color: 1 }));
        admit(bottom);
        let added = FIELD_WIDTH;
        if (value?.fixture === 'cascade') {
          for (const y of [FLOOR-2, FLOOR-4]) { const sides = Array.from({ length: FIELD_WIDTH }, (_, x) => ({ x: LEFT + x, y, color: 2 })).filter(p => p.x !== 144); admit(sides); admit([{x:144,y,color:1}]); }
          admit(Array.from({ length: FIELD_WIDTH }, (_, x) => ({ x: LEFT + x, y: FLOOR-3, color: 1 }))); added += 3*FIELD_WIDTH;
        } else { const supported = Array.from({ length: 40 }, (_, i) => ({ x: 124 + i, y: FLOOR-2, color: 2 })); admit(supported); added += supported.length; }
        game.added = added; game.active = null; game.world.pendingInbound = 0; game.setPhase('settling'); game.spawnDelay = 0; game.state = hidden ? 'paused' : 'playing';
        qaFixture = { name: value?.fixture === 'cascade' ? 'artificial-cell-support-cascade' : 'artificial-cell-bottom-bridge', artificial: true, added, bridgeGrains: FIELD_WIDTH, supportedGrains: added - FIELD_WIDTH, source: 'Explicit QA cell placement, not natural gameplay' };
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
      if(data.type==='snapshot-received'){
        if(!transportInFlight||data.transportId!==transportInFlight.id||data.epoch!==transportInFlight.epoch){rejectedTransportReceipts++;return;}
        if(transportInFlight.kind==='full'&&transportInFlight.epoch===epoch)fullReceiptEpoch=epoch;
        transportInFlight=null;serviceTransport();return;
      }
      if (data.type === 'init') { hidden = !!data.hidden; init(data); post({ type: 'ready', epoch }); return; }
      if(data.type==='presented'){
        const g=composite?.pending[0];if(data.epoch!==epoch||!composite?.ack(data,{game})){rejectedPresentationAcks++;return;}
        checkpoint={epoch,groupId:g.groupId,token:g.lastToken,ruleTick:g.lastRuleTick,controlTick:g.lastControlTick,revision:g.revision,burst:g.burst,pieceId:g.pieceId,quiet:g.quiet};
        presentedToken=g.lastToken;accrue();publishGroups(composite.drainReady());if(pendingFullSync&&publish({force:true,full:true}))pendingFullSync=false;schedule();return;
      }
      if (data.type === 'visibility') {
        if (data.epoch !== epoch) return;
        accrue(); hidden = !!data.hidden; if (hidden && game) { game.pause(); stopClock(); publish({ force: true }); }
        post({ type: 'visibility', hidden, state: game?.state, epoch }); return;
      }
      if (data.type === 'resync') { if (data.epoch !== undefined && data.epoch !== epoch) return; pendingFullSync=!publish({force:true,full:true});return; }
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
      const published=publish({ force: previousState !== game.state || previousPhase !== game.phase || game.state !== 'playing' || ['start', 'restart', 'pause', 'resume', 'snapshot', 'qa-bridge'].includes(data.name), full: data.name === 'snapshot' || data.name === 'qa-bridge' });if(data.name==='snapshot'&&!published)pendingFullSync=true; schedule();
    } catch (error) { post({ type: 'ack', id: data.id, name: data.name, error: String(error?.message || error), epoch }); fatal(error); }
  }
  return { receive, stats, pump, get game() { return game; }, get epoch() { return epoch; }, dispose() { stopClock(); } };
}
if (typeof self !== 'undefined' && typeof self.postMessage === 'function' && typeof document === 'undefined') { const runtime = createSimulationRuntime(); self.onmessage = ({ data }) => runtime.receive(data); }
