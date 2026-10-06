import test from'node:test';import assert from'node:assert/strict';
import{AudioUnlock,StartDiagnostics}from'../../dist/preview/audio-unlock.js';
const flush=()=>Promise.resolve();
test('Muted gestures neither construct nor resume audio, and unprofiled paths do not read a clock',async()=>{
 let creates=0,resumes=0;const context={state:'suspended',resume(){resumes++;this.state='running';return Promise.resolve();}};
 const gate=new AudioUnlock({createContext:()=>{creates++;return context;},now(){throw Error('Unprofiled clock read');}});
 for(let i=0;i<20;i++)assert.equal(gate.unlock(false),null);assert.equal(creates,0);assert.equal(resumes,0);
 assert.equal(gate.unlock(true),context);await flush();gate.unlock(false);gate.unlock(true);assert.equal(creates,1);assert.equal(resumes,1);assert.equal(gate.snapshot().records,undefined);
});
test('Constructor wall time, synchronous resume and asynchronous completion remain separately visible',async()=>{
 let now=10,resolve;const context={state:'suspended',resume(){now+=3;return new Promise(r=>resolve=r);}};
 const gate=new AudioUnlock({diagnostics:true,now:()=>now,createContext(){now+=45;return context;}});
 gate.unlock(true,'start');let s=gate.snapshot({detail:true});assert.equal(s.lastConstructor.beforeAtMs,10);assert.equal(s.lastConstructor.afterAtMs,55);assert.equal(s.lastConstructor.syncWallMs,45);assert.equal(s.lastResume.beforeAtMs,55);assert.equal(s.lastResume.afterAtMs,58);assert.equal(s.lastResume.syncWallMs,3);assert.equal(s.lastResume.outcome,'pending');
 for(let i=0;i<100;i++)gate.unlock(true,'input:left');assert.equal(gate.counts.constructorCalls,1);assert.equal(gate.counts.resumeCalls,1);assert.equal(gate.counts.pendingSkips,100);
 now=120;context.state='running';resolve();await flush();s=gate.snapshot();assert.equal(s.lastResume.promiseSettledAtMs,120);assert.equal(s.lastResume.promiseElapsedMs,65);assert.equal(s.lastResume.promiseWaitAfterReturnMs,62);assert.equal(s.lastResume.outcome,'resolved');assert.equal(s.pendingResume,false);
 gate.unlock(true);assert.equal(gate.counts.resumeCalls,1);assert.equal(gate.counts.runningSkips,1);
});
test('Resume rejection clears only the pending attempt and a later gesture can retry',async()=>{
 let calls=0;const context={state:'suspended',resume(){calls++;return calls===1?Promise.reject(undefined):Promise.resolve();}};
 const gate=new AudioUnlock({diagnostics:true,createContext:()=>context});assert.doesNotThrow(()=>gate.unlock(true));await flush();assert.equal(gate.counts.resumeRejected,1);assert.equal(gate.lastResume.outcome,'rejected');assert.equal(gate.pending,null);
 gate.unlock(true);await flush();assert.equal(calls,2);assert.equal(gate.counts.resumeResolved,1);
});
test('Synchronous constructor or resume failure never escapes, and retries stay in later calls',async()=>{
 let creates=0,resumes=0;const context={state:'suspended',resume(){if(++resumes===1)throw new Error('resume unavailable');return Promise.resolve();}};
 const gate=new AudioUnlock({diagnostics:true,createContext(){if(++creates===1)throw undefined;return context;}});
 assert.equal(gate.unlock(true),null);assert.equal(gate.lastConstructor.outcome,'error');assert.equal(gate.counts.constructorErrors,1);
 assert.equal(gate.unlock(true),context);assert.equal(gate.lastResume.outcome,'sync-error');assert.equal(gate.pending,null);
 gate.unlock(true);await flush();assert.equal(creates,2);assert.equal(resumes,2);assert.equal(gate.counts.resumeResolved,1);
});
test('Muting while resume is pending does not create another context or trigger queued audio',async()=>{
 let resolve,calls=0;const context={state:'suspended',resume(){calls++;return new Promise(r=>resolve=r);}};
 const gate=new AudioUnlock({createContext:()=>context});gate.unlock(true);for(let i=0;i<20;i++)gate.unlock(false);assert.equal(calls,1);context.state='running';resolve();await flush();assert.equal(gate.context,context);assert.equal(gate.counts.constructorCalls,1);assert.equal(gate.pending,null);
});
test('Closed context is never resumed or replaced outside a requested construction path',()=>{
 const context={state:'closed',resume(){throw Error('must not resume closed context');}};const gate=new AudioUnlock({createContext:()=>context});assert.equal(gate.unlock(true),context);assert.equal(gate.unlock(true),context);assert.equal(gate.counts.constructorCalls,1);assert.equal(gate.counts.resumeCalls,0);
});
test('Audio histories are bounded while cumulative errors and maxima survive eviction',()=>{
 let now=0;const gate=new AudioUnlock({diagnostics:true,now:()=>now,createContext(){now+=50;throw Error('unavailable');}});for(let i=0;i<80;i++)gate.unlock(true);assert.equal(gate.records.length,24);assert.equal(gate.counts.constructorErrors,80);assert.equal(gate.max.constructorSyncMs,50);
});
test('Startup includes synchronous audio work and reports first draw without pretending to measure presentation',()=>{
 let now=100;const d=new StartDiagnostics({enabled:true,now:()=>now}),r=d.begin({type:'click',timeStamp:97},true);d.beforeAudio(r);now=150;d.afterAudio(r);now=153;d.finish(r);d.noteDraw(164,165,167);
 const s=d.snapshot();assert.equal(s.latest.audioSyncWallMs,50);assert.equal(s.latest.handlerSyncWallMs,53);assert.equal(s.latest.handlerToFirstDrawMs,67);assert.equal(s.latest.eventToFirstDrawMs,70);assert.match(s.measurement,/not GPU presentation/);d.noteDraw(180,181,182);assert.equal(s.latest.firstPlayingDrawCompletedAtMs,d.latest.firstPlayingDrawCompletedAtMs);
});
test('Disabled startup diagnostics do no timing work or retention',()=>{
 const d=new StartDiagnostics({now(){throw Error('Disabled startup clock read');}}),r=d.begin({type:'click'},true);d.beforeAudio(r);d.afterAudio(r);d.finish(r);d.noteDraw(10,11,12);assert.equal(d.latest,null);assert.equal(d.records.length,0);
});
test('A blocked inactive resume gets exactly one retry when a real user activation arrives',async()=>{
 let active=false,calls=0;const resolves=[];const context={state:'suspended',resume(){calls++;return new Promise(r=>resolves.push(r));}};
 const gate=new AudioUnlock({diagnostics:true,activation:()=>active,createContext:()=>context});gate.unlock(true,'programmatic-start');for(let i=0;i<20;i++)gate.unlock(true,'input:left');assert.equal(calls,1);
 active=true;gate.unlock(true,'input:left');for(let i=0;i<20;i++)gate.unlock(true,'input:left');assert.equal(calls,2);assert.equal(gate.lastResume.retryReason,'became-active');assert.equal(gate.snapshot().outstandingResumePromises,2);
 resolves[0]();await flush();assert.equal(gate.snapshot().pendingResume,true,'old settlement must not clear the newer attempt');assert.equal(gate.snapshot().outstandingResumePromises,1);
 context.state='running';resolves[1]();await flush();assert.equal(gate.snapshot().pendingResume,false);assert.equal(gate.snapshot().outstandingResumePromises,0);
});
test('Explicit start/sound-enable retries a hung resume without recreating context, including unsupported activation',async()=>{
 let creates=0,calls=0;const pending=[];const context={state:'suspended',resume(){calls++;return new Promise((resolve,reject)=>pending.push({resolve,reject}));}};
 const gate=new AudioUnlock({diagnostics:true,createContext(){creates++;return context;}});gate.unlock(true,'start');gate.unlock(true,'input:right');assert.equal(calls,1);
 gate.unlock(true,'sound-toggle',{retryPending:true});assert.equal(calls,2);assert.equal(gate.lastResume.retryReason,'explicit-request');pending[0].reject(new Error('older attempt'));await flush();assert.equal(gate.pending!==null,true);
 gate.unlock(true,'start',{retryPending:true});assert.equal(calls,3);assert.equal(creates,1);pending[1].resolve();await flush();assert.equal(gate.pending!==null,true);pending[2].resolve();await flush();assert.equal(gate.pending,null);assert.equal(gate.counts.resumeRejected,1);assert.equal(gate.counts.resumeResolved,2);
});
