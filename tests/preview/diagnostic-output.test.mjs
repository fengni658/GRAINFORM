import test from'node:test';import assert from'node:assert/strict';
import{diagnosticMode,DiagnosticOutput,compactSession}from'../../dist/preview/diagnostic-output.js';
import{FrameDiagnostics}from'../../dist/preview/diagnostics.js';
import{SessionMetrics}from'../../dist/metrics.js';
import{Game}from'../../dist/preview/engine.js';
test('Ordinary and summary paths allocate no phase profiler and leave engine methods untouched',()=>{
 for(const search of['','?summary']){const mode=diagnosticMode(search),g=new Game(),before=g.sandStep;const d=mode==='profile'?new FrameDiagnostics():null;if(d)d.instrument(g);assert.equal(d,null);assert.equal(g.sandStep,before);}
 assert.equal(diagnosticMode('?qa'),'profile');const quiet=new DiagnosticOutput('off');for(let t=0;t<60000;t+=17)assert.equal(quiet.next(t,'playing',true),null);
});
test('Ten minutes of live output never serializes detailed history; terminal playing frame also stays compact',()=>{
 const c=new DiagnosticOutput('profile');let summaries=0,full=0;for(let frame=0;frame<36000;frame++){const k=c.next(frame*1000/60,'playing',true);summaries+=k==='summary';full+=k==='full';}
 assert(summaries>=59&&summaries<=61);assert.equal(full,0);assert.equal(c.next(600001,'over',true),'summary');assert.equal(c.next(600018,'over',false),'full');assert.equal(c.next(600035,'over',false),null);
 assert.equal(c.next(601000,'playing',true),'summary');assert.equal(c.next(601017,'paused',false),'full');
 const lite=new DiagnosticOutput('summary');assert.equal(lite.next(0,'ready',false),'summary');assert.equal(lite.next(1,'playing',true),'summary');assert.equal(lite.next(2,'paused',false),'summary');
});
test('Compact visible summary preserves all cumulative bad-work/gap statistics without copying history',()=>{
 const m=new SessionMetrics();for(let i=0;i<2000;i++)m.record(i===700?239.1:2,i===900?1199.7:16.667,true,i*17,{usedJSHeapSize:1000,totalJSHeapSize:2000});
 const a=m.snapshot(40000),b=compactSession(m,40000);for(const k of Object.keys(b))assert.equal(b[k],a[k],k);assert.equal(b.playingWorkMax,239.1);assert.equal(b.playingFrameGapMax,1199.7);assert.equal(b.heapSamples,undefined);assert(JSON.stringify(b).length<1000);
});
