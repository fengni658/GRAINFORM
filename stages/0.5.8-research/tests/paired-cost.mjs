import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const sourceDir=pathToFileURL(path.resolve(process.env.CANDIDATE??'grain058-candidate/candidate')+'/');
const dir=pathToFileURL(path.resolve(process.env.EVIDENCE??'grain058-candidate/evidence/paired-candidate')+'/');fs.mkdirSync(dir,{recursive:true});
const {Game,PER_PIECE}=await import(new URL('game.mjs',sourceDir));
const {World}=await import(new URL('ca-world.mjs',sourceDir));
const {FrameWorld}=await import(new URL('ca-frame-world.mjs',sourceDir));
const {createSimulationRuntime,CLOCK_CONTRACT}=await import(new URL('simulation-worker.mjs',sourceDir));
const {decodeSnapshotWire}=await import(new URL('snapshot-transport.mjs',sourceDir));
const {CompositePresentation}=await import(new URL('composite-presentation.mjs',sourceDir));
const {SettleAnchors}=await import(new URL('settle-anchors.mjs',sourceDir));
const {CALayerRenderer}=await import(new URL('ca-layer.mjs',sourceDir));
const G=await import(new URL('board-geometry.mjs',sourceDir));
const {COLOR_COUNT}=await import(new URL('grain-palette.mjs',sourceDir));
const {createCanvas}=createRequire(import.meta.url)('@napi-rs/canvas');

const hash=x=>createHash('sha256').update(x).digest('hex');
const manifest=()=>Object.fromEntries(fs.readdirSync(sourceDir).filter(n=>fs.statSync(new URL(n,sourceDir)).isFile()).sort().map(n=>[n,hash(fs.readFileSync(new URL(n,sourceDir)))]));
const sourceManifest=manifest(),bound={buildId:'b-'+hash(Object.entries(sourceManifest).map(([file,sha])=>`${file} ${sha}\n`).join('')),files:Object.entries(sourceManifest).map(([file,sha256])=>({file,sha256}))};
for(const f of bound.files)assert.equal(sourceManifest[f.file],f.sha256,`manifest ${f.file}`);
const appSource=fs.readFileSync(new URL('app.mjs',sourceDir),'utf8');
const storeSource=appSource.slice(appSource.indexOf('export const staleEpoch'),appSource.indexOf('export function clearHighlightBodies'));
const sandbox={COLOR_COUNT};vm.createContext(sandbox);vm.runInContext(storeSource.replaceAll('export ','')+'\nthis.GridBodyStore=GridBodyStore;',sandbox);
const {GridBodyStore}=sandbox;
const LIMIT={pieces:40,outputs:1500,prepControlTicks:20000,bytes:3*1024*1024};
const W=382,H=679,DT=CLOCK_CONTRACT.stepMs;
const outbox=[],prepLedger=[],trace=[],wireTrace=[],acks=[],commands=[],aggregates={},counters={};
let logical=0,commandId=0,epoch=0,stage='preparation',profiling=false,runtimeScope=false,current=null,snapshot=null,prepRaf=0;
let lastStringifyMs=0,encodePending=0,lastEncodedRecord=null;
const round=x=>Math.round(x*1e6)/1e6;
function count(key,n=1){if(!profiling)return;counters[key]=(counters[key]??0)+n;if(current)current.counts[key]=(current.counts[key]??0)+n;}
function record(key,ms){if(!profiling)return;const k=stage+':'+key;(aggregates[k]??=[]).push(ms);if(current)current.ms[key]=(current.ms[key]??0)+ms;}
function timed(key,fn){const t=performance.now();try{return fn()}finally{record(key,performance.now()-t)}}
function wrap(obj,key,label=key,observe=null){const original=obj[key];obj[key]=function(...args){if(!profiling)return original.apply(this,args);if(observe)observe.call(this,args);return timed(label,()=>original.apply(this,args))};return()=>{obj[key]=original}}
const stringify=JSON.stringify;
JSON.stringify=function(value,...args){if(!profiling||!runtimeScope||value?.type!=='snapshot')return stringify(value,...args);const t=performance.now(),result=stringify(value,...args);lastStringifyMs=performance.now()-t;record('worker.stringify',lastStringifyMs);count('worker.snapshotPackets');lastEncodedRecord={stage,seq:value.seq,kind:value.mode,groups:value.presentationGroups.length,patchUpserts:value.bodyPatch.upsert.length,patchRemovals:value.bodyPatch.removed.length,paths:value.presentationGroups.reduce((n,g)=>n+g.frames.reduce((s,f)=>s+f.paths.length,0),0),points:value.presentationGroups.reduce((n,g)=>n+g.points,0),births:value.presentationGroups.reduce((n,g)=>n+g.births.length,0)};return result};
const encode=TextEncoder.prototype.encode;
TextEncoder.prototype.encode=function(...args){if(!profiling||!runtimeScope)return encode.apply(this,args);const t=performance.now(),result=encode.apply(this,args),ms=performance.now()-t;record('worker.utf8Encode',ms);record('worker.encodeTotal',ms+lastStringifyMs);count('worker.bytes',result.byteLength);Object.assign(lastEncodedRecord??{}, {bytes:result.byteLength,stringifyMs:round(lastStringifyMs),utf8Ms:round(ms)});return result};
function worker(fn){const prev=runtimeScope;runtimeScope=true;try{return timed('worker.callbackInclusive',fn)}finally{runtimeScope=prev}}
const runtime=createSimulationRuntime({now:()=>logical,timeOrigin:0,setTimer:()=>1,clearTimer(){},post:(message,transfer=[])=>{
 const t=performance.now(),cloned=structuredClone(message,{transfer}),ms=performance.now()-t;outbox.push(cloned);
 if(profiling){record(message.type==='snapshot-wire'?'worker.transferPost':'worker.controlPost',ms);if(message.type==='snapshot-wire'){lastEncodedRecord.postMs=round(ms);wireTrace.push(lastEncodedRecord);lastEncodedRecord=null;}}
}});
const receive=m=>worker(()=>runtime.receive(m));
function cmd(name,value){const m={type:'command',id:++commandId,epoch:runtime.epoch,pieceId:runtime.game?.pieceId,name,value};receive(m);return m.id}
function checkControl(m){if(m.type==='fatal'||m.error)throw Error(`runtime ${JSON.stringify(m)}`);if(m.type==='ack'){assert(m.applied||m.name==='pause',`command rejected ${m.name}: ${m.reason}`);if(profiling)commands.push({id:m.id,name:m.name,applied:m.applied,tick:m.tick});}}
function drainPrep(){let guard=0;while(outbox.length){assert(++guard<2000);const wire=outbox.shift(),m=decodeSnapshotWire(wire);checkControl(m);if(m.type==='snapshot')for(const g of m.presentationGroups??[]){receive({type:'presented',epoch:g.epoch,groupId:g.groupId,firstToken:g.firstToken,lastToken:g.lastToken,lastRuleTick:g.lastRuleTick,burst:g.burst,pieceId:g.pieceId,revision:g.revision,lastControlTick:g.lastControlTick,raf:++prepRaf});}if(wire.type==='snapshot-wire')receive({type:'snapshot-received',transportId:wire.transportId,epoch:wire.epoch});}}
function targetFor(n){const g=runtime.game,worldWidth=(1+Math.max(...g.active.shape.map(q=>q[0])))*24;return 24*Math.round((288-worldWidth)/48)+[-48,48,0,-72,72,0][n%6]}
function moveToTarget(n,drain){const g=runtime.game,targetWorld=targetFor(n),spawnWorld=G.gridToWorldX(g.active.x);let delta=targetWorld-G.gridToWorldX(g.active.x),guard=0;while(Math.abs(delta)>1e-9){assert(++guard<10);const gridDelta=Math.round(targetWorld/G.GRAIN_PITCH-g.active.x);assert(gridDelta!==0);cmd('move',Math.sign(gridDelta)*Math.min(48,Math.abs(gridDelta)*G.GRAIN_PITCH+1e-8));drain();delta=targetWorld-G.gridToWorldX(g.active.x)}assert.equal(G.gridToWorldX(g.active.x),targetWorld);return {targetWorld,spawnWorld,actualLeft:G.gridToWorldX(g.active.x)}}
function integrity(g){const w=g.world,ids=new Set,occupied=new Set;let live=0,unsupported=0,legalRoll=0,momentum=0,sleepMismatch=0,minY=G.FLOOR,maxY=-1;
 for(let i=0;i<w.n;i++)if(w.live[i]){live++;assert(w.x[i]>=0&&w.x[i]<G.FIELD_WIDTH&&w.y[i]>=0&&w.y[i]<G.FIELD_HEIGHT);const cell=w.y[i]*G.FIELD_WIDTH+w.x[i];assert.equal(w.grid[cell],i+1);assert(!ids.has(w.identity[i]));ids.add(w.identity[i]);assert(!occupied.has(cell));occupied.add(cell);minY=Math.min(minY,w.y[i]);maxY=Math.max(maxY,w.y[i]);if(w.empty(w.x[i],w.y[i]+1))unsupported++;if([-1,1].some(dx=>w.empty(w.x[i]+dx,w.y[i])&&w.empty(w.x[i]+dx,w.y[i]+1)))legalRoll++;if(w.vy[i]!==0||w.credit[i]!==0)momentum++;if(w.cache.get(w.identity[i])?.sleep!==true)sleepMismatch++;}
 assert.equal(live,w.count);assert.equal(g.added-g.rawCleared,w.count);assert.equal(w.grid.reduce((n,v)=>n+(v!==0),0),live);assert.equal(w.chunks.size,0);assert.equal(unsupported,0);assert.equal(legalRoll,0);assert.equal(momentum,0);assert.equal(sleepMismatch,0);assert.equal(g.presentationToken,g.presentedToken);assert.equal(g.presentationTicks.size,0);assert.equal(w.framePending,false);
 return {live,occupied:occupied.size,identities:ids.size,activeChunks:w.chunks.size,unsupported,legalRoll,momentum,sleepMismatch,minY,maxY,noMoveSweeps:w.noMoveSweeps,lastMoveTick:w.lastMoveTick,presentedTick:w.presentedTick,added:g.added,rawCleared:g.rawCleared,pieces:g.pieces,phase:g.phase,state:g.state,presentationToken:g.presentationToken,presentedToken:g.presentedToken,bodyHash:hash(stringify(w.bodies())),gridHash:hash(w.grid)};}
function snapshotProgress(tag,extra={}){fs.appendFileSync(new URL('progress.jsonl',dir),stringify({tag,at:new Date().toISOString(),logical,pieces:runtime.game?.pieces,bodyCount:runtime.game?.world.count,...extra})+'\n');}
const startWall=performance.now();let results={status:'running',buildId:bound.buildId,limits:LIMIT,sourceManifest,gridBodyStoreExtractSha256:hash(storeSource),environment:{node:process.version,canvas:createRequire(import.meta.url)('@napi-rs/canvas/package.json').version,platform:os.platform(),arch:os.arch(),cpuModel:os.cpus()[0]?.model,cpuCount:os.cpus().length},seed:412,dpr:1,width:W,height:H};
let r,p,a,canvas;
try{
 receive({type:'init',seed:412});drainPrep();cmd('start');drainPrep();
 for(let n=0;n<LIMIT.pieces;n++){
  const g=runtime.game;assert.equal(g.phase,'falling');const target=moveToTarget(n,drainPrep),prior=g.world.count,tick=g.gameTick;cmd('drop');drainPrep();let guard=0;
  while(g.phase!=='falling'&&g.state==='playing'){assert(++guard<1500,'preparation piece control bound');assert(g.gameTick<LIMIT.prepControlTicks);logical+=DT;worker(()=>runtime.pump());drainPrep()}
  assert.equal(g.state,'playing','fixed seed must remain live');assert.equal(g.added-g.rawCleared,g.world.count);assert.equal(g.world.chunks.size,0);assert.equal(g.presentationToken,g.presentedToken);
  prepLedger.push({piece:g.pieces,...target,prior,remaining:g.world.count,added:g.added,rawCleared:g.rawCleared,controlTicks:g.gameTick-tick,materialToken:g.presentationToken});snapshotProgress('prepared-piece');
  if(g.world.count>=8000)break;
 }
 assert(runtime.game.world.count>=8000,'fixed high-density scene unavailable within 40 pieces');cmd('pause');drainPrep();results.preparation={method:'Actual Game/createSimulationRuntime model replay, fixed legal commands, direct synthetic group-final ACKs only in prep; no native outputs',durationMs:performance.now()-startWall,ledger:prepLedger,integrity:integrity(runtime.game)};
 fs.writeFileSync(new URL('preparation.json',dir),stringify(results.preparation,null,2));snapshotProgress('ready-for-native-profile');
 
 // All profiling probes are in-memory wrappers; the frozen source files remain untouched.
 const game=runtime.game,world=game.world;
 for(const method of ['step','drop','move','frame','snapshot','findConnections','completePresentation'])wrap(game,method,'game.'+method,()=>count('game.'+method+'Calls'));
 wrap(world,'step','world.frameStep',()=>count('world.frameStepCalls'));
 wrap(world,'sync','world.sync',function(){count('world.syncCalls');count('world.syncSlotScans',this.n);count('world.syncCacheMembershipScans',this.cache.size)});
 wrap(world,'snapshot','world.snapshot',function(){count('world.snapshotCalls');count('world.snapshotSlotScans',this.n)});
 wrap(world,'materialPaths','world.materialPaths',function(){count('world.materialPathsCalls');count('world.materialPathCandidateIds',this.frameIds.length)});
 wrap(world,'consumeChanges','world.consumeChanges',()=>count('world.consumeChangesCalls'));
 wrap(world,'connections','world.connections',function(){count('world.connectionGridScans',this.grid.length)});
 const originalRule=World.prototype.step;
 World.prototype.step=function(...args){count('world.ruleStepCalls');const ms=performance.now();try{return originalRule.apply(this,args)}finally{record('world.ruleStep',performance.now()-ms);count('world.referenceMergeSlotScans',this.n);if(this.frameVisitBits){count('world.bitsetWordsCleared',Math.ceil(this.n/32));count('world.bitsetWordsEnumerated',Math.ceil(this.n/32));count('world.bitsetIdsMarked',this.stepIds?.length??0);count('world.mergeSlotsVisited',this.stepIds?.length??0);}else count('world.mergeSlotsVisited',this.n);}};
 a=new SettleAnchors();p=new CompositePresentation({anchors:a});r=new CALayerRenderer({createCanvas:()=>createCanvas(1,1)});r.configure(W,H,'standard');canvas=createCanvas(W,H);
 const store=new GridBodyStore({onResync:request=>{throw Error('unexpected resync '+stringify(request))}});
 for(const method of ['sample','accept','restore','didDraw'])wrap(p,method,'presentation.'+method,()=>count('presentation.'+method+'Calls'));
 for(const method of ['apply','paint','syncMovingLayers','qualifyTail','rebuildStaticIndex'])wrap(r,method,'renderer.'+method,()=>count('renderer.'+method+'Calls'));
 wrap(r,'synchronize','renderer.synchronize',function(args){const queue=args[1]?.displayQueue??args[0];count('renderer.synchronizeCalls');count('renderer.synchronizeQueuePathVisits',queue.reduce((n,f)=>n+f.paths.length,0));count('renderer.synchronizeSamplePositionVisits',args[1]?.positions.length??0)});
 wrap(r,'syncMovingLayers','renderer.syncMovingLayersProbe',function(){count('renderer.priorMovingScans',this.moving.size);count('renderer.nextMovingScans',this.physicalMoving.size)});
 wrap(store,'accept','main.gridBodyStore',args=>{count('main.patchUpserts',args[0].bodyPatch.upsert.length);count('main.patchRemovals',args[0].bodyPatch.removed.length)});
 let mainPackets=0;
 function drainMain(){let guard=0;while(outbox.length){assert(++guard<2000);const wire=outbox.shift(),m=timed('main.wireDecode',()=>decodeSnapshotWire(wire));checkControl(m);if(m.type==='snapshot'){
  timed('main.prepareInclusive',()=>{const accepted=store.accept(m);assert(accepted.accepted);snapshot=m.snapshot;const at=logical;
   p.setContinuity(m.epoch,snapshot,accepted.full);if(m.mode==='full'&&m.presentationCheckpoint)p.restore(m.presentationCheckpoint,m.presentationGroups??[],at);else p.accept(m.epoch,m.presentationGroups??[],at);
   p.setPaused(snapshot.state!=='playing',at);r.synchronize(p.queue,p.sample(at));a.observePatch(m.epoch,m.bodyPatch,r.bodies);r.apply(m.bodyPatch);
  });mainPackets++;count('main.snapshotPackets');
 }if(wire.type==='snapshot-wire')receive({type:'snapshot-received',transportId:wire.transportId,epoch:wire.epoch});}}
 let quietHash=null;
 async function draw(label){assert(trace.length<LIMIT.outputs,'native output bound');current={index:trace.length,stage:label,logical,bodyCount:world.count,phase:game.phase,ms:{},counts:{}};const row=current;
  const sample=timed('main.drawPreparation',()=>{const sample=p.sample(logical);r.synchronize(p.queue,sample);a.prepare(r,{group:sample?.group,alpha:sample?.alpha??0,now:logical});return sample});
  canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d');ctx.setTransform(W/G.WIDTH,0,0,H/G.VIEW_GRID_HEIGHT,0,-G.VIEW_GRID_TOP*H/G.VIEW_GRID_HEIGHT);ctx.fillStyle='#0d1315';ctx.fillRect(0,G.VIEW_GRID_TOP,G.WIDTH,G.VIEW_GRID_HEIGHT);ctx.save();ctx.beginPath();ctx.rect(G.LEFT,G.VIEW_GRID_TOP,G.FIELD_WIDTH,G.VIEW_GRID_HEIGHT);ctx.clip();
  const selection=snapshot?.clearIds?.length?{ids:snapshot.clearIds,alpha:.65,fillStyle:'#fffce8'}:null;
  timed('renderer.drawSubmit',()=>r.draw(ctx,selection,{standardBoard:true}));ctx.restore();
  let pixels=timed('renderer.fullReadback',()=>ctx.getImageData(0,0,W,H));row.displayHash=hash(pixels.data);pixels=null;
  a.commit();const ack=p.didDraw(logical);row.ack=ack?.lastToken??null;if(ack){assert.equal(ack.raf,logical);acks.push({...ack,output:row.index});receive({type:'presented',...ack});}
  const metrics=r.read();row.ops={stablePaints:metrics.lastStablePaints,dynamicPaints:metrics.lastDynamicPaints,dirtyTiles:metrics.lastDirtyTiles,cacheCopiedPixels:metrics.lastCacheCopiedPixels,moving:metrics.dynamicCount,pendingGroups:p.core.groups.length,pendingPoints:p.points(),selectionIds:selection?.ids.length??0};
  row.ms=Object.fromEntries(Object.entries(row.ms).map(([k,v])=>[k,round(v)]));trace.push(row);current=null;
  canvas.width=canvas.height=1;await new Promise(setImmediate);global.gc();
  if(label==='quiet'){if(quietHash)assert.equal(row.displayHash,quietHash);quietHash=row.displayHash;assert.equal(row.ops.stablePaints,0);assert.equal(row.ops.dynamicPaints,0);}
  if(trace.length%25===0)snapshotProgress('native-output',{outputs:trace.length,stage});
 }
 stage='bootstrap';profiling=true;cmd('snapshot');drainMain();await draw('bootstrap');
 results.bootstrap={bodyCount:world.count,storeCount:store.bodies.size,rendererCount:r.bodies.size,metrics:r.read()};assert.equal(store.bodies.size,world.count);
 const metricsBefore={...world.metrics},rendererBefore=r.read();stage='active';const activeStart=performance.now();
 cmd('resume');drainMain();results.drop={piece:game.pieces+1,...moveToTarget(game.pieces,drainMain),prior:world.count};cmd('drop');drainMain();
 const afterDrop=world.count;assert.equal(afterDrop-results.drop.prior,PER_PIECE);
 let activeGuard=0;
 while(true){assert(++activeGuard<LIMIT.outputs);logical+=DT;worker(()=>runtime.pump());drainMain();await draw('active');drainMain();
  assert.equal(game.added-game.rawCleared,world.count);assert.equal(store.bodies.size,snapshot.bodyCount);assert.equal(r.bodies.size,store.bodies.size);if(store.revision===world.revision)assert.equal(store.bodies.size,world.count);
  if(game.state==='playing'&&game.phase==='falling'&&!world.chunks.size&&!game.awaitingPresentation&&!p.core.groups.length&&!runtime.stats().transportInFlightCount&&!runtime.stats().transportQueuedOwners)break;
  assert.equal(game.state,'playing','measured drop must remain live');
 }
 results.activeDurationMs=performance.now()-activeStart;results.afterDrop=afterDrop;results.settled=integrity(game);results.worldMetricsDelta=Object.fromEntries(Object.keys(metricsBefore).map(k=>[k,world.metrics[k]-metricsBefore[k]]));results.rendererActiveMetrics={before:rendererBefore,after:r.read()};
 stage='quiet';cmd('pause');drainMain();const quietTick=game.gameTick;for(let i=0;i<60;i++){logical+=DT;await draw('quiet');drainMain();}assert.equal(game.gameTick,quietTick);
 results.final=integrity(game);results.finalRuntimeStats=runtime.stats();results.finalPresentation=p.read();results.finalRenderer=r.read();assert.equal(results.finalRuntimeStats.rejectedPresentationAcks,0);assert.equal(results.finalRuntimeStats.rejectedTransportReceipts,0);assert.equal(results.finalPresentation.pending,0);assert.equal(store.resyncs,0);assert.equal(results.finalRuntimeStats.transportInFlightCount,0);assert.equal(results.finalRuntimeStats.transportQueuedOwners,0);assert.equal(r.fallbackReason,null);
 results.mainPackets=mainPackets;results.status='passed';
}catch(error){results.status='failed';results.error={message:error.message,stack:error.stack};process.exitCode=1;}
finally{
 profiling=false;runtime.dispose();JSON.stringify=stringify;TextEncoder.prototype.encode=encode;
 for(const c of [canvas,r?.canvas,r?.scratchCanvas,r?.selectionCache.canvas])if(c)c.width=c.height=1;
 results.sourceUnchanged=stringify(sourceManifest)===stringify(manifest());assert(results.sourceUnchanged,'frozen source changed');
 const summary=values=>{const a=[...values].sort((x,y)=>x-y),sum=a.reduce((n,v)=>n+v,0);return {calls:a.length,totalMs:round(sum),medianMs:round(a[Math.floor((a.length-1)/2)]??0),p95Ms:round(a[Math.ceil(a.length*.95)-1]??0),p99Ms:round(a[Math.ceil(a.length*.99)-1]??0),maxMs:round(a.at(-1)??0)}};
 results.timings=Object.fromEntries(Object.entries(aggregates).map(([k,v])=>[k,summary(v)]));results.operations=counters;results.outputs={total:trace.length,bootstrap:trace.filter(x=>x.stage==='bootstrap').length,active:trace.filter(x=>x.stage==='active').length,quiet:trace.filter(x=>x.stage==='quiet').length};results.acks=acks;results.commands=commands;results.wireTrace=wireTrace;results.trace=trace;results.totalWallMs=round(performance.now()-startWall);
 results.notes=['One native DPR1 run; logical 60Hz scheduling is controlled, not measured FPS.','Preparation actual Game/runtime model replay with direct final ACKs; measured final ACKs come only from actual presentation after successful native draw and full readback.','Method timings inclusive and nested; do not sum nested categories. Worker callback excludes main receive/draw and is not an OS worker-thread timing.','Worker encodeTotal is JSON stringify plus TextEncoder encode; transferPost is actual structuredClone with transfer in the same process, no OS postMessage/delivery claim.','WireDecode records control envelopes too, for which decodeSnapshotWire is a cheap identity call; actual wire packet counts/bytes are separately recorded.','Output canvas resized to1x1 then event-loop yield/GC each output; stable/scratch/selection caches persist. Excludes PNG/video, app DOM/HUD/preview/rigid block rendering. No persistent-browser memory, FPS, GPU, or user-device claim.','Reference n and bitmap marked IDs/word bounds are exact loop-bound counts; bitset maintenance is separately counted, not assumed free.','One fixed baseline/candidate pair; source identity bound separately; no browser166ms attribution.'];
 const text=stringify(results);assert(Buffer.byteLength(text)<LIMIT.bytes,'evidence size bound');fs.writeFileSync(new URL('result.json',dir),text);snapshotProgress('finished',{status:results.status,outputs:results.outputs,bytes:Buffer.byteLength(text)});console.log(stringify({status:results.status,error:results.error,outputs:results.outputs,preparation:results.preparation?.integrity,final:results.final,bytes:Buffer.byteLength(text),wallMs:results.totalWallMs},null,2));
}
