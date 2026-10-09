import test from 'node:test';
import assert from 'node:assert/strict';
import { MaterialFrameQueue, positionOnPath, validateMaterialFrame, CALayerRenderer, materialStyle } from '../ca-layer.mjs';
import { createSimulationRuntime, CLOCK_CONTRACT as C } from '../simulation-worker.mjs';
const frame = (token, id = 1, x = 30.5, y = 20.5) => ({ token, ruleTick: token * 4, phases: 68, paths: [{ id, points: [x,y,0,x,y+1,1,x+1,y+1,10,x+1,y+2,11] }] });

test('material sampling preserves every ordered one-cell leg and all phase holds', () => {
 const path = frame(1).paths[0];
 assert.deepEqual(positionOnPath(path, 0), [30.5,20.5]);
 assert.deepEqual(positionOnPath(path, .5/68), [30.5,21]);
 assert.deepEqual(positionOnPath(path, 5/68), [30.5,21.5]);
 assert.deepEqual(positionOnPath(path, 9.5/68), [31,21.5]);
 assert.deepEqual(positionOnPath(path, 10.5/68), [31.5,22]);
 assert.deepEqual(positionOnPath(path, 1), [31.5,22.5]);
 assert.throws(() => validateMaterialFrame({...frame(1),paths:[{id:1,points:[30.5,20.5,0,31.5,21.5,1]}]}), /unit legs/);
});
test('render completion is exact, ordered and bounded; a delayed rAF cannot skip frames', () => {
 const q = new MaterialFrameQueue(); q.accept(1,[frame(1),frame(2)],0);
 assert.throws(() => q.accept(1,[frame(3)],0),/two frames/);
 assert.equal(q.didDraw(),null); assert.equal(q.sample(1000).frame.token,1);
 assert.deepEqual(q.didDraw(),{epoch:1,token:1,ruleTick:4}); assert.equal(q.queue.length,1);
 assert.equal(q.sample(1000).frame.token,2); assert.equal(q.didDraw().token,2); assert.equal(q.queue.length,0);
 assert.equal(q.read().maxPending,2);
});
test('pause freezes the current exact path and restart invalidates undrawn old tokens', () => {
 const q = new MaterialFrameQueue(); q.accept(7,[frame(1)],0); q.setPaused(true,8);
 const paused = q.sample(8); assert.deepEqual(q.sample(10000).positions,paused.positions); assert.equal(q.didDraw(),null);
 q.setPaused(false,10008); assert.equal(q.sample(10008).alpha,paused.alpha);
 q.reset(8); assert.equal(q.accept(7,[frame(2)],10008),false); assert.equal(q.didDraw(),null);
 q.accept(8,[frame(1)],10008); assert.equal(q.sample(10008).alpha,0); assert.equal(q.didDraw(),null);
 q.sample(10025); assert.deepEqual(q.didDraw(),{epoch:8,token:1,ruleTick:4});
});
class Clock {
 constructor(){this.t=0;this.timers=new Map();this.id=0;}
 now=()=>this.t;
 set=(fn,delay)=>{const id=++this.id;this.timers.set(id,{fn,at:this.t+delay});return id;};
 clear=id=>this.timers.delete(id);
 to(target){let n=0;while(this.timers.size){const[id,t]=[...this.timers].sort((a,b)=>a[1].at-b[1].at)[0];if(t.at>target+1e-7)break;if(++n>10000)throw Error('unbounded timer');this.timers.delete(id);this.t=Math.max(this.t,t.at);t.fn();}this.t=Math.max(this.t,target);}
}
class MovingGame {
 constructor(){this.state='ready';this.phase='settling';this.gameTick=0;this.presentationToken=0;this.presentedToken=0;this.world={chunks:new Set([1]),stats:()=>({active:1,lastTick:{visits:1}})};}
 start(){this.state='playing';return true;}pause(){this.state='paused';return true;}resume(){this.state='playing';return true;}
 step(){this.gameTick++;this.presentationToken++;return true;}
 completePresentation(token){if(token!==this.presentedToken+1)return false;this.presentedToken=token;return true;}
 get awaitingPresentation(){return this.presentationToken>this.presentedToken;}
 frame({full}){return {state:this.state,phase:this.phase,tick:this.gameTick,presentationToken:this.presentationToken,materialFrame:this.presentationToken?frame(this.presentationToken):null,bodyCount:0,events:[],clearIds:[],bodyPatch:{reset:full,previousRevision:full?null:0,revision:0,upsert:[],removed:[]}};}
}
function runtimeFor(GameType=MovingGame){const clock=new Clock(),messages=[];const runtime=createSimulationRuntime({GameType,now:clock.now,setTimer:clock.set,clearTimer:clock.clear,post:m=>messages.push(structuredClone(m))});runtime.receive({type:'init',qa:true});let id=0;const command=name=>runtime.receive({type:'command',id:++id,name,epoch:runtime.epoch});command('start');return{clock,messages,runtime,command};}

test('worker retains wall-time debt when two frames block, rejects invalid ACK and catches up without substep loss', () => {
 const {clock,runtime,messages}=runtimeFor();clock.to(1000);let s=runtime.stats();
 assert.equal(s.steps,2);assert.equal(s.pendingMaterialFrames,2);assert.equal(clock.timers.size,0);assert.ok(Math.abs(s.debtSeconds-58/60)<1e-9);assert.ok(Math.abs(s.clockConservationErrorMs)<1e-7);
 runtime.receive({type:'presented',epoch:runtime.epoch,token:2});assert.equal(runtime.stats().presentedToken,0);
 runtime.receive({type:'presented',epoch:runtime.epoch-1,token:1});assert.equal(runtime.stats().presentedToken,0);
 for(let token=1;token<=58;token++){runtime.receive({type:'presented',epoch:runtime.epoch,token});clock.to(1000);}
 s=runtime.stats();assert.equal(s.steps,60);assert.ok(s.debtSeconds<1e-9);assert.equal(s.maxPendingMaterialFrames,2);
 const frames=messages.filter(m=>m.type==='snapshot'&&m.snapshot.materialFrame).map(m=>m.snapshot.materialFrame);
 assert.equal(frames.length,60);assert.deepEqual(frames.map(f=>f.token),Array.from({length:60},(_,i)=>i+1));
 assert.equal(s.rejectedPresentationAcks,2);assert.ok(s.messageBytes>0);runtime.dispose();
});
test('worker pause keeps debt and pending exact tokens; restart isolates ACK, resync includes full in-flight paths', () => {
 const {clock,runtime,command,messages}=runtimeFor();clock.to(100);command('pause');const before=runtime.stats();clock.to(2000);assert.equal(runtime.stats().debtSeconds,before.debtSeconds);assert.equal(runtime.stats().pendingMaterialFrames,2);
 runtime.receive({type:'resync',epoch:runtime.epoch});assert.deepEqual(messages.at(-1).presentationFrames.map(f=>f.token),[1,2]);
 const old=runtime.epoch;command('restart');runtime.receive({type:'presented',epoch:old,token:1});assert.equal(runtime.stats().presentedToken,0);assert.equal(runtime.stats().steps,0);assert.equal(runtime.stats().pendingMaterialFrames,0);runtime.dispose();
});
test('real CA does not clear a bridge before its latest exact material frame is painted', () => {
 const clock=new Clock(),messages=[];const runtime=createSimulationRuntime({now:clock.now,setTimer:clock.set,clearTimer:clock.clear,post:m=>messages.push(structuredClone(m))});runtime.receive({type:'init',qa:true});runtime.receive({type:'command',id:1,name:'qa-bridge',epoch:runtime.epoch});clock.to(1000);
 const g=runtime.game;assert.equal(g.phase,'settling');assert.equal(g.pendingClear.length,0);assert.equal(g.world.stats().live,272);
 const flight=messages.filter(m=>m.type==='snapshot'&&m.snapshot.materialFrame).map(m=>m.snapshot.materialFrame);assert.ok(flight.length>=1&&flight.length<=2);
 for(const f of flight)runtime.receive({type:'presented',epoch:runtime.epoch,token:f.token});
 clock.to(1000);assert.equal(g.rawCleared,232);assert.equal(g.world.stats().live,40);assert.equal(g.active,null,'Fall after the clear needs its own presented paths');assert.ok(runtime.stats().maxPendingMaterialFrames<=2);runtime.dispose();
});
class Context {constructor(){this.cells=[];this.images=0;}save(){}restore(){}setTransform(){}clearRect(){}drawImage(){this.images++;}fillRect(...v){this.cells.push(v);}beginPath(){}arc(x,y,r){this.cells.push([x,y,r]);}fill(){}}
test('CA cell drawing uses identity-fixed subpixel grain, cached static cells and current path positions',()=>{
 const cache=new Context(),screen=new Context(),r=new CALayerRenderer({createCanvas:()=>({getContext:()=>cache})});
 r.apply({reset:true,removed:[],upsert:[{id:1,x:31.5,y:22.5,color:1},{id:2,x:50.5,y:30.5,color:2}]});
 const q=new MaterialFrameQueue();q.accept(1,[frame(1)],0);r.synchronize(q.queue,q.sample(0));r.configure(576,864,'a');r.draw(screen);
 assert.equal(cache.cells.length,1);assert.equal(screen.cells.length,1);const style=materialStyle(1);assert.ok(style.radius>=.475&&style.radius<=.625);assert.ok(Math.abs(style.dx)<=.18&&Math.abs(style.dy)<=.18);assert.ok(style.brightness>=.8&&style.brightness<=1.1);assert.ok(Math.abs(screen.cells[0][0]-30.5-style.dx)<1e-9);assert.ok(Math.abs(screen.cells[0][1]-20.5-style.dy)<1e-9);assert.deepEqual(r.styles.get(1),{...style,baseColor:'#eac370',fillColor:r.styles.get(1).fillColor});
 const shape=screen.cells[0].slice(2),cachedStyle=r.styles.get(1);r.synchronize(q.queue,q.sample(8));r.draw(screen);assert.equal(cache.cells.length,1);assert.deepEqual(screen.cells.at(-1).slice(2),shape);assert.equal(r.styles.get(1),cachedStyle);assert.equal(r.read().countsConserved,true);
});
test('12000 settled cells are cached, removed cells leave no stale paint, and resize/theme rebuild once',()=>{
 const cache=new Context(),screen=new Context(),r=new CALayerRenderer({createCanvas:()=>({getContext:()=>cache})});
 const bodies=Array.from({length:12000},(_,id)=>({id,x:28.5+id%232,y:419.5-Math.floor(id/232),color:1+id%4,sleep:true}));
 r.apply({reset:true,removed:[],upsert:bodies});r.configure(576,864,'standard');r.draw(screen);assert.equal(cache.cells.length,12000);r.draw(screen);assert.equal(cache.cells.length,12000);assert.equal(r.read().lastDynamicPaints,0);
 r.apply({reset:false,removed:[0],upsert:[]});cache.cells=[];r.draw(screen);assert.ok(cache.cells.length>0&&cache.cells.length<11999);assert.equal(r.bodies.has(0),false);
 const rebuilds=r.read().fullCacheRebuilds;r.configure(864,1296,'contrast');r.draw(screen);assert.equal(r.read().fullCacheRebuilds,rebuilds+1);
 r.apply({reset:true,removed:[],upsert:[]});r.draw(screen);assert.equal(r.read().liveCount,0);assert.equal(r.read().lastStablePaints,0);
 const fallback=new CALayerRenderer({createCanvas:()=>({getContext:()=>null})});fallback.apply({reset:true,removed:[],upsert:bodies.slice(0,2)});fallback.configure(576,864,'standard');fallback.draw(screen);assert.equal(fallback.read().mode,'full-cell-fallback');assert.equal(fallback.read().lastDynamicPaints,2);
});
test('early-clear QA settles the artificial floor before spawn; cascade really requires a second settled check',()=>{
 const clock=new Clock(),messages=[];const runtime=createSimulationRuntime({now:clock.now,setTimer:clock.set,clearTimer:clock.clear,post:m=>messages.push(structuredClone(m))});runtime.receive({type:'init',qa:true});
 runtime.receive({type:'command',id:1,name:'qa-bridge',epoch:runtime.epoch,value:{fixture:'early-clear'}});assert.equal(runtime.game.state,'playing');assert.equal(runtime.game.phase,'falling');assert.equal(runtime.game.world.stats().live,184);assert.equal(runtime.game.world.chunks.size,0);
 runtime.receive({type:'command',id:2,name:'qa-bridge',epoch:runtime.epoch,value:{fixture:'cascade'}});assert.equal(runtime.game.world.stats().live,928);
 let observed=0;for(let n=0;n<100;n++){clock.to(clock.t+C.stepMs);const packets=messages.slice(observed);observed=messages.length;for(const p of packets)if(p.epoch===runtime.epoch&&p.snapshot?.materialFrame)runtime.receive({type:'presented',epoch:runtime.epoch,token:p.snapshot.materialFrame.token});if(runtime.game.chain===2&&runtime.game.active)break;}
 assert.equal(runtime.game.maxChain,2);assert.equal(runtime.game.rawCleared,928);assert.equal(runtime.game.world.stats().live,0);assert.ok(runtime.game.active);runtime.dispose();
});
test('a failed second canvas preserves immediate drawing through the existing cell fallback',()=>{
 for(const failure of ['null-context','throw-create']){
  const cache=new Context(),screen=new Context();let canvases=0;
  const renderer=new CALayerRenderer({createCanvas:()=>{if(++canvases===1)return{getContext:()=>cache};if(failure==='throw-create')throw Error('Scratch allocation failed');return{getContext:()=>null};}});
  renderer.apply({reset:true,removed:[],upsert:[{id:1,x:30.5,y:20.5,color:1},{id:2,x:50.5,y:30.5,color:2}]});renderer.configure(576,864,'standard');renderer.draw(screen);assert.equal(renderer.read().mode,'ca-cell-cached-layer');
  const queue=new MaterialFrameQueue();queue.accept(1,[frame(1)],0);renderer.synchronize(queue.queue,queue.sample(0));screen.cells=[];
  assert.doesNotThrow(()=>renderer.draw(screen));assert.equal(renderer.read().mode,'full-cell-fallback');assert.match(renderer.read().fallbackReason,/unavailable|allocation failed/);assert.equal(renderer.read().lastDynamicPaints,2);assert.equal(screen.cells.length,2);assert.equal(canvases,2);
  renderer.draw(screen);assert.equal(renderer.read().lastDynamicPaints,2);assert.equal(canvases,2);
 }
});
