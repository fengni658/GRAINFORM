import test from'node:test';import assert from'node:assert/strict';
import{CallbackMetrics}from'../../dist/preview/callback-metrics.js';
import{SessionMetrics}from'../../dist/metrics.js';
import{FrameDiagnostics}from'../../dist/preview/diagnostics.js';
import{harness}from'../dom-harness.mjs';
function complete(m,id,{start=0,coreStart=start,coreEnd=coreStart+1,end=coreEnd+1,playing=true,steps=1}={}){m.prepare(id,id*16.667,playing,steps,start,coreStart,coreEnd);m.finish(end);}
test('Full callback preserves a 1.8ms core while exposing its excluded statistics/scheduling tail',()=>{
 const m=new CallbackMetrics();complete(m,1,{start:0,coreStart:.2,coreEnd:2,end:36.73});
 let s=m.snapshot({detail:true});assert.equal(s.full.count,0);assert.equal(s.pendingCompletedFrame.fullWallMs,36.73);assert.equal(s.pendingCompletedFrame.coreWorkMs,1.8);assert.equal(s.pendingCompletedFrame.tailMs,34.73);
 m.commitPending();s=m.snapshot({detail:true});assert.equal(s.full.count,1);assert.equal(s.playingFull.maxMs,36.73);assert.equal(s.playingTail.maxMs,34.73);assert.equal(s.prelude.maxMs,.2);assert.equal(s.throughFrameId,1);assert.equal(s.pendingCompletedFrame,null);assert.equal(s.slowestPlayingFrames[0].frameId,1);assert.equal(s.slowestPlayingTails[0].frameId,1);
 m.commitPending();assert.equal(m.snapshot().full.count,1,'A completed frame is never counted twice');
});
test('Prior-sample aggregation is charged to the next measured prelude, not hidden or recursive',()=>{
 const m=new CallbackMetrics();complete(m,1,{start:0,coreStart:0,coreEnd:2,end:5});
 let now=16;const callbackBegin=now;m.commitPending();now+=7;const coreBegin=now;now+=2;const coreEnd=now;now+=3;complete(m,2,{start:callbackBegin,coreStart:coreBegin,coreEnd,end:now});m.commitPending();
 const s=m.snapshot();assert.equal(s.full.count,2);assert.equal(s.latestCompletedFrame.preludeMs,7);assert.equal(s.latestCompletedFrame.coreWorkMs,2);assert.equal(s.latestCompletedFrame.tailMs,3);assert.equal(s.latestCompletedFrame.fullWallMs,12);
});
test('Playing attribution follows the original callback state across pause, and large tails remain visible',()=>{
 const m=new CallbackMetrics();complete(m,1,{coreEnd:1,end:239.1,playing:true});m.commitPending();complete(m,2,{coreEnd:2,end:500,playing:false});m.commitPending();
 const s=m.snapshot({detail:true});assert.equal(s.full.count,2);assert.equal(s.playingFull.count,1);assert.equal(s.full.maxMs,500);assert.equal(s.playingFull.maxMs,239.1);assert.equal(s.playingFull.p95Ms,239.1);assert.equal(s.playingTail.maxMs,238.1);assert.equal(s.slowestPlayingFrames.length,1);
});
test('Full timing retention stays bounded; complete-session maxima survive many later frames',()=>{
 const m=new CallbackMetrics();for(let i=0;i<12000;i++){complete(m,i+1,{start:i*17,coreStart:i*17+.1,coreEnd:i*17+1,end:i*17+(i===20?1000:2+i%10),playing:i%4!==0});m.commitPending();}
 const s=m.snapshot({detail:true});assert.equal(s.full.count,12000);assert.equal(s.full.maxMs,1000);assert(s.slowestPlayingFrames.length<=6);assert(s.slowestPlayingTails.length<=6);assert.equal(m.pending.length,8);assert.equal(m.latest.length,8);assert.equal(m.full.histogram.length,2001);
});
test('Finishing the measurement performs only fixed stores, not aggregation or snapshot work',()=>{
 const m=new CallbackMetrics();m.prepare(1,0,true,1,0,0,1);m.full.add=()=>{throw Error('aggregation at final boundary');};m.snapshot=()=>{throw Error('export at final boundary');};assert.doesNotThrow(()=>m.finish(10));assert.equal(m.pending[5],10);assert.equal(m.pendingReady,true);
});
test('Actual app includes SessionMetrics, phase-record, ring scheduling and next-frame aggregation costs',async()=>{
 let h;const originalSession=SessionMetrics.prototype.record,originalStages=FrameDiagnostics.prototype.recordFrame,originalCommit=CallbackMetrics.prototype.commitPending;
 try{
  SessionMetrics.prototype.record=function(...args){const value=originalSession.apply(this,args);h.advance(35);return value;};
  FrameDiagnostics.prototype.recordFrame=function(...args){const value=originalStages.apply(this,args);h.advance(14);return value;};
  CallbackMetrics.prototype.commitPending=function(...args){const value=originalCommit.apply(this,args);h.advance(7);return value;};
  h=await harness({entry:'preview',initial:{'grainform.preview.v1.preferences':'{"sound":false}'}});
  const rawRaf=globalThis.requestAnimationFrame;globalThis.requestAnimationFrame=cb=>{h.advance(4);return rawRaf(cb);};
  h.el('startButton').dispatch('click');h.frame();h.key('KeyP');h.frame();
  const d=JSON.parse(h.el('qaOutput').textContent);assert.equal(d.game.state,'paused');assert.equal(d.session.playingWorkMax,0,'legacy core scope retained');assert.equal(d.callback.playingFull.count,1);assert(Math.abs(d.callback.playingFull.maxMs-60)<1e-9);assert(Math.abs(d.callback.playingTail.maxMs-53)<1e-9);assert(Math.abs(d.callback.playingPrelude.maxMs-7)<1e-9);assert.equal(d.callback.latestCompletedFrame.coreWorkMs,0);assert.match(d.callback.scope,/Not CPU time/);
 }finally{SessionMetrics.prototype.record=originalSession;FrameDiagnostics.prototype.recordFrame=originalStages;CallbackMetrics.prototype.commitPending=originalCommit;}
});
test('Visible JSON export remains inside both core and full measurements',async()=>{
 const h=await harness({entry:'preview',initial:{'grainform.preview.v1.preferences':'{"sound":false}'}}),output=h.el('qaOutput');let text=output.textContent;
 Object.defineProperty(output,'textContent',{get:()=>text,set:value=>{text=value;h.advance(11);},configurable:true});h.el('startButton').dispatch('click');h.frame();h.key('KeyP');h.frame();
 const d=JSON.parse(output.textContent);assert.equal(d.session.playingWorkMax,11);assert.equal(d.callback.playingFull.maxMs,11);assert.equal(d.callback.playingTail.maxMs,0);
});
test('Summary exposes full and legacy timing without stage profiler details',async()=>{
 const h=await harness({entry:'preview',search:'?summary',initial:{'grainform.preview.v1.preferences':'{"sound":false}'}});h.el('startButton').dispatch('click');h.frame(2);h.key('KeyP');h.frame();const d=JSON.parse(h.el('qaOutput').textContent);assert.equal(d.outputKind,'summary');assert.equal(d.callback.schema,'callback-wall-v1');assert(d.callback.full.count>0);assert(!('timing'in d));assert(!('slowestPlayingFrames'in d.callback));assert.equal(d.session.playingFrames,d.callback.playingFull.count);
});
test('A tail-only outlier keeps the exact core context without needing a core-work or gap top entry',()=>{
 const m=new CallbackMetrics(),context={frameId:1,phases:{simulation:1,render:.8},engine:{sandStep:1},render:{reused:false,phases:{pixelBuild:.8}}};m.prepare(1,0,true,1,0,0,1.8,context);m.finish(36.73);m.commitPending();const d=m.snapshot({detail:true});assert.deepEqual(d.slowestPlayingTails[0].coreContext,context);assert.equal(d.slowestPlayingTails[0].coreWorkMs,1.8);assert.equal(d.slowestPlayingTails[0].fullWallMs,36.73);assert(!('coreContext'in m.snapshot().latestCompletedFrame));
});
