import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulationRuntime, CLOCK_CONTRACT as C } from '../simulation-worker.mjs';
import { Game } from '../game.mjs';
class Clock {
 constructor(){this.t=0;this.id=0;this.timers=new Map();this.maxTimers=0;}
 now=()=>this.t;
 set=(fn,delay)=>{const id=++this.id;this.timers.set(id,{fn,at:this.t+delay});this.maxTimers=Math.max(this.maxTimers,this.timers.size);return id;};
 clear=id=>this.timers.delete(id);
 one(){if(!this.timers.size)return false;const[id,timer]=[...this.timers].sort((a,b)=>a[1].at-b[1].at)[0];this.timers.delete(id);this.t=Math.max(this.t,timer.at);timer.fn();return true;}
 to(target){let n=0;while(this.timers.size){const next=Math.min(...[...this.timers.values()].map(t=>t.at));if(next>target+1e-7)break;if(++n>10000)throw Error('Timer did not yield');this.one();}this.t=Math.max(this.t,target);}
}
function setup({cost=0,real=false,qa=false}={}){
 const clock=new Clock(),messages=[];
 class FakeGame{
  constructor(){this.state='ready';this.gameTick=0;this.physicsTick=0;this.moves=0;this.clearTicks=0;this.fullCalls=0;this.deltaCalls=0;}
  start(){this.state='playing';return true;}pause(){this.state='paused';return true;}resume(){this.state='playing';return true;}
  move(){this.moves++;return true;}rotate(){return true;}drop(){return true;}softDrop(){return true;}
  step(){if(this.state!=='playing')return false;clock.t+=cost;this.gameTick++;if(this.clearTicks)this.clearTicks--;else this.physicsTick++;return true;}
  frame({full}){if(full)this.fullCalls++;else this.deltaCalls++;return{state:this.state,tick:this.gameTick,time:this.gameTick/120,physicsTick:this.physicsTick,bodyCount:0,events:[],clearIds:[],bodyPatch:{reset:full,previousRevision:full?null:0,revision:0,upsert:[],removed:[]}};}
 }
 const runtime=createSimulationRuntime({GameType:real?Game:FakeGame,now:clock.now,setTimer:clock.set,clearTimer:clock.clear,post:m=>messages.push(m)});runtime.receive({type:'init',seed:1,qa});let id=0;const command=name=>runtime.receive({type:'command',id:++id,name,epoch:runtime.epoch});command('start');return{clock,messages,runtime,command};
}
test('one active wall second executes 120 fixed control ticks, one timer, exact conserved debt',()=>{
 const{clock,runtime}=setup();clock.to(1000);const s=runtime.stats();assert.equal(s.steps,120);assert.ok(Math.abs(s.simSeconds-1)<1e-10);assert.ok(Math.abs(s.activeWallSeconds-1)<1e-10);assert.ok(s.debtSeconds<1e-9);assert.ok(Math.abs(s.clockConservationErrorMs)<1e-7);assert.equal(clock.maxTimers,1);assert.equal(s.scheduler,'fixed-120hz-retained-accumulator');runtime.dispose();
});
test('a late callback keeps every owed tick and catch-up is bounded per callback',()=>{
 const{clock,runtime}=setup();clock.t=1000;clock.one();let s=runtime.stats();assert.equal(s.steps,8);assert.ok(Math.abs(s.debtSteps-112)<=1);assert.equal(s.lastBatchSteps,C.maxBatchSteps);clock.to(1000);s=runtime.stats();assert.equal(s.steps,120);assert.ok(s.debtSeconds<1e-9);assert.equal(s.maxObservedBatchSteps,8);assert.equal(clock.maxTimers,1);runtime.dispose();
});
test('slow steps do not rebase time; existing debt survives pause/resume/hidden',()=>{
 const{clock,runtime,command}=setup({cost:20});for(let i=0;i<24;i++)clock.one();let s=runtime.stats();assert.equal(s.maxObservedBatchSteps,1);assert.ok(s.debtSeconds>.25);assert.ok(s.activeWallSeconds>s.simSeconds);assert.ok(Math.abs(s.clockConservationErrorMs)<1e-7);
 command('pause');const debt=runtime.stats().debtSeconds,wall=runtime.stats().activeWallSeconds,tick=runtime.stats().steps;clock.t+=5000;assert.equal(runtime.stats().debtSeconds,debt);assert.equal(runtime.stats().activeWallSeconds,wall);assert.equal(runtime.stats().steps,tick);assert.equal(clock.timers.size,0);
 runtime.receive({type:'visibility',hidden:true,epoch:runtime.epoch});command('resume');assert.equal(runtime.game.state,'paused');runtime.receive({type:'visibility',hidden:false,epoch:runtime.epoch});assert.equal(runtime.game.state,'paused');command('resume');assert.ok(runtime.stats().debtSeconds>=debt);clock.one();assert.equal(runtime.stats().steps,tick+1);runtime.dispose();
});
test('sub-tick debt before pause is retained and hidden wall time is excluded',()=>{
 const{clock,runtime,command}=setup();clock.t=5;command('pause');assert.equal(runtime.stats().debtSeconds,.005);clock.t=1005;runtime.receive({type:'visibility',hidden:true,epoch:runtime.epoch});runtime.receive({type:'visibility',hidden:false,epoch:runtime.epoch});command('resume');clock.to(1000+C.stepMs);assert.equal(runtime.stats().steps,1);assert.ok(Math.abs(runtime.stats().activeWallSeconds-1/120)<1e-9);runtime.dispose();
});
test('real clear lasts 24 control ticks while physical world stays frozen',()=>{
 const{clock,runtime}=setup({real:true}),g=runtime.game;const specs=Array.from({length:132},(_,col)=>({id:col,color:1,row:0,col}));assert.equal(g.world.addMany(specs).accepted,true);g.pendingClear=[specs.map(p=>p.id)];g.clearTimer=24/120;const physicsTick=g.world.tick;clock.to(200);assert.equal(runtime.stats().steps,24);assert.equal(g.gameTick,24);assert.equal(g.world.tick,physicsTick);assert.equal(g.world.stats().live,0);assert.equal(g.clearTimer,0);assert.ok(Math.abs(runtime.stats().simSeconds-.2)<1e-9);runtime.dispose();
});
test('incremental publish avoids default full snapshots and full sync is explicit',()=>{
 const{clock,runtime,messages,command}=setup();clock.to(1000);assert.equal(runtime.game.fullCalls,1);assert.ok(runtime.game.deltaCalls>20);const packets=messages.filter(m=>m.type==='snapshot');assert.equal(packets[0].mode,'full');for(let i=1;i<packets.length;i++){assert.equal(packets[i].seq,packets[i-1].seq+1);assert.equal(packets[i].baseSeq,packets[i-1].seq);assert.equal(packets[i].mode,'delta');}
 runtime.receive({type:'resync',epoch:runtime.epoch});assert.equal(messages.at(-1).mode,'full');assert.equal(runtime.game.fullCalls,2);const oldEpoch=runtime.epoch;command('restart');assert.equal(runtime.epoch,oldEpoch+1);assert.equal(runtime.stats().steps,0);assert.equal(runtime.stats().debtSeconds,0);runtime.dispose();
});
test('old-round state commands and visibility cannot mutate new epoch; input ids ACK once',()=>{
 const{runtime,command,messages}=setup();const oldEpoch=runtime.epoch;command('restart');const current=runtime.epoch;runtime.receive({type:'command',id:99,name:'pause',epoch:oldEpoch});assert.equal(runtime.game.state,'playing');assert.equal(messages.at(-1).reason,'stale-round');runtime.receive({type:'visibility',hidden:true,epoch:oldEpoch});assert.equal(runtime.game.state,'playing');runtime.receive({type:'command',id:100,name:'left',epoch:current});runtime.receive({type:'command',id:100,name:'left',epoch:current});assert.equal(runtime.game.moves,1);assert.equal(messages.filter(m=>m.type==='ack'&&m.id===100).length,2);runtime.dispose();
});


test('capacity-refused hard drop immediately publishes over and stops wall/debt accounting',()=>{
 const{clock,runtime,messages}=setup({real:true});runtime.game.world.maxParticles=675;const before=runtime.stats();runtime.receive({type:'command',id:777,name:'drop',epoch:runtime.epoch});const after=runtime.stats();assert.equal(runtime.game.state,'over');assert.equal(after.running,false);assert.equal(clock.timers.size,0);const last=messages.filter(m=>m.type==='snapshot').at(-1);assert.equal(last.snapshot.state,'over');assert.equal(last.snapshot.bodyCount,0);assert.ok(last.seq>2,'Over state must bypass same-time publish throttle');clock.t=1000;const later=runtime.stats();assert.equal(later.activeWallSeconds,after.activeWallSeconds);assert.equal(later.debtSeconds,after.debtSeconds);assert.equal(later.steps,before.steps);runtime.dispose();
});


test('QA bridge is init-gated, explicit/artificial, epoch-reset and clears by the original timing',()=>{
 const ordinary=setup({real:true});const epoch=ordinary.runtime.epoch;ordinary.runtime.receive({type:'command',id:88,name:'qa-bridge',epoch});assert.equal(ordinary.messages.at(-1).reason,'qa-disabled');assert.equal(ordinary.runtime.epoch,epoch);assert.equal(ordinary.runtime.game.world.stats().live,0);assert.equal(ordinary.runtime.game.state,'playing');ordinary.runtime.dispose();
 const{clock,runtime,messages}=setup({real:true,qa:true});const oldEpoch=runtime.epoch;runtime.receive({type:'command',id:88,name:'qa-bridge',epoch:oldEpoch});assert.equal(runtime.epoch,oldEpoch+1);const first=messages.filter(m=>m.type==='snapshot').at(-1);assert.equal(first.mode,'full');assert.equal(first.bodyPatch.reset,true);assert.equal(first.snapshot.qaFixture.artificial,true);assert.equal(first.snapshot.bodyCount,172);assert.equal(first.snapshot.added,172);assert.equal(first.snapshot.pieces,0);assert.equal(first.snapshot.clearIds.length,0);clock.to(16*1000/120);assert.equal(runtime.game.pendingClear.flat().length,132);const frozenPhysicsTick=runtime.game.world.tick;clock.to(40*1000/120);assert.equal(runtime.game.world.tick,frozenPhysicsTick);assert.equal(runtime.game.gameTick,40);assert.equal(runtime.game.world.stats().live,40);assert.equal(runtime.game.rawCleared,132);assert.equal(runtime.game.added,runtime.game.world.stats().live+runtime.game.rawCleared);assert.equal(runtime.game.pendingClear.length,0);clock.to(1000);assert.ok(runtime.game.world.bodies().some(b=>b.row===0),'Support grains must really descend after clearing');runtime.dispose();
});
