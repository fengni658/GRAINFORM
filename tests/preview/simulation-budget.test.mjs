import test from'node:test';import assert from'node:assert/strict';
import{Game}from'../../dist/preview/engine.js';import{Game as Ref}from'../../dist/preview/reference-0.4-r1-engine.js';
import{SimulationBudget,CommittedView,STEP_MS}from'../../dist/preview/simulation-budget.js';
import{harness}from'../dom-harness.mjs';
const fields=['grid','material','vx','vy','fx','fy','energy','sleep','movedAt','departureDrop','surface','activeChunks','nextChunks','rigid','clearMask'];
function same(a,b){for(const p of fields)assert.deepEqual(a[p],b[p],p);assert.deepEqual(a.snapshot(),b.snapshot());assert.equal(a.physicsRng.state,b.physicsRng.state);assert.equal(a.pieceRng.state,b.pieceRng.state);assert.deepEqual(a.consumeEvents(),b.consumeEvents());}
function dense(Class,width=288,height=432){const g=new Class({width,height,seed:930241});g.state='playing';g.active=null;g.spawnDelay=1e9;for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;if(((Math.imul(i+1,1664525)+1013904223)>>>0)%100<85){g.grid[i]=1+Math.min(2,Math.floor(x/96));g.material[i]=1+i*13%255;g.added++;}}g.wakeAll();return g;}
test('Exact dense wake and chunked stepping preserve reference arrays/RNG/events at every completed tick',()=>{
 const a=dense(Game),b=dense(Ref);assert.equal(a.count(),106213);for(let tick=0;tick<60;tick++){a.beginStep();let chunks=0;while(!a.advanceStep())chunks++;b.step();same(a,b);if(tick===0)assert(chunks>50);}assert.equal(a.count(),106213);
});
test('All retained time debt is eventually processed regardless of clock-driven chunk grouping',()=>{
 let clock=0;const a=dense(Game,61,65),b=dense(Ref,61,65),m=new SimulationBudget({clock:()=>clock,budgetMs:6}),advance=a.advanceStep.bind(a);a.advanceStep=()=>{clock+=2;return advance();};
 let total=0;for(const gap of[16,500,33,17]){total+=gap;m.run(a,gap);}
 assert(m.debtMs>400);let frames=0;while(m.debtMs+1e-7>=STEP_MS||a.stepPending){m.run(a,0);assert(++frames<1000);}for(let i=0;i<Math.floor(total/STEP_MS);i++)b.step();same(a,b);assert.equal(m.completedSteps,Math.floor(total/STEP_MS));assert(Math.abs(m.activeElapsedMs-(m.completedSteps*STEP_MS+m.debtMs))<1e-6);assert(m.sessionMaxDebtMs>=500);assert(m.yieldedFrames>0);
});
test('Committed rendering never exposes a partially calculated board and responds to pause using the old board',()=>{
 const g=dense(Game,61,65),view=new CommittedView(g),before=view.view.grid.slice();g.beginStep();assert(!g.advanceStep());assert(g.stepPending);view.capture(true);assert.deepEqual(view.view.grid,before);g.pause();view.capture();assert.equal(view.view.state,'paused');assert.deepEqual(view.view.grid,before);assert.equal(g.advanceStep(),false);g.resume();while(!g.advanceStep()){}view.capture();assert.deepEqual(view.view.grid,g.grid);assert.equal(view.view.tick,g.tick);
});
test('Restart cancels started and not-yet-started cursors; stale generations cannot mutate the new board',()=>{
 for(const started of[false,true]){const g=dense(Game,61,65);g.beginStep();const stale=g.stepCursor;if(started)g.advanceStep();g.reset(93);g.start();const before=g.snapshot(),grid=g.grid.slice();stale.next();assert.deepEqual(g.snapshot(),before);assert.deepEqual(g.grid,grid);assert.equal(g.stepPending,false);}
});
test('Synchronous API and chunked API stay equal through rigid input, clearing and reset',()=>{
 const a=new Game({seed:18}),b=new Ref({seed:18});a.start();b.start();for(let tick=0;tick<300;tick++){for(const g of[a,b]){if(g.state==='over'){g.reset(19);g.start();}if(tick%24===0){g.move((tick%3-1)*24);g.rotate();g.hardDrop();}}a.beginStep({softDrop:tick%4===0});while(!a.advanceStep()){}b.step({softDrop:tick%4===0});same(a,b);}
});
test('Native input defers in order during a partial step, reports latency, and pause counts cancellation',async()=>{
 const h=await harness({entry:'preview',initial:{'grainform.preview.v1.preferences':'{"sound":false}'}});h.api.start();const g=h.api.game;g.grid[g.size-1]=1;g.material[g.size-1]=42;g.added=1;g.wakeAll();const raw=g.advanceStep.bind(g);h.api.game.advanceStep=()=>{h.advance(2);return raw();};h.frame();assert(h.api.game.stepPending);const x=h.api.game.active.x;
 h.key('ArrowLeft',{timeStamp:0});h.up('ArrowLeft');h.key('ArrowRight',{timeStamp:0});h.up('ArrowRight');assert.equal(h.api.game.active.x,x);assert.equal(h.api.metrics().simulation.input.pending,2);
 for(let n=0;n<100&&h.api.metrics().simulation.input.pending;n++)h.frame();const m=h.api.metrics().simulation;assert.equal(m.input.pending,0);assert.equal(m.input.applied,2);assert.equal(h.api.game.active.x,x);assert(m.input.maxLatencyMs>0);assert(m.input.maxQueueWaitMs>0);
 h.api.game.wakeAll();for(let n=0;n<200&&!h.api.game.stepPending;n++)h.frame();assert(h.api.game.stepPending);h.key('ArrowLeft');h.api.pause();assert.equal(h.api.metrics().simulation.input.pending,0);assert.equal(h.api.metrics().simulation.input.cancelled,1);const tick=h.api.game.tick;h.frame(3);assert.equal(h.api.game.tick,tick);h.api.start();assert.equal(h.api.game.stepPending,false);assert.equal(h.api.metrics().simulation.debtMs,0);
});

test('Timing fields start finite and resetting keeps only explicit session high-water/cancelled debt',()=>{
 const m=new SimulationBudget({clock:()=>12}),g=new Game();for(const value of Object.values(m.snapshot(g)))if(typeof value==='number')assert(Number.isFinite(value));
 m.activeElapsedMs=150;m.debtMs=90;m.sessionMaxDebtMs=140;m.reset();const state=m.snapshot(g);assert.equal(state.activeElapsedMs,0);assert.equal(state.maxStepActiveMs,0);assert.equal(state.completedStateActiveAgeMs,0);assert.equal(state.cancelledByResetMs,90);assert.equal(state.sessionMaxDebtMs,140);for(const value of Object.values(state))if(typeof value==='number')assert(Number.isFinite(value));
});
