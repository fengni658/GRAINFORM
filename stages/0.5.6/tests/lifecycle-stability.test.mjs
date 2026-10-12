import test from 'node:test';
import assert from 'node:assert/strict';
import {bootRealWorker} from './real-worker-boot-harness.mjs';

// Actual app, worker runtime, wire transport and native Canvas. DOM, events and
// delivery timing are controlled doubles; these are not browser/BFCache claims.
async function command(h,name,value){const promise=h.qa.command(name,value);h.flush();return await promise;}
async function prepared(kind,options={}){
 const h=await bootRealWorker(options);h.flush();
 if(kind!=='start'){await command(h,'start');await command(h,'pause');}
 return h;
}
function issueViaButton(h,kind){
 if(kind==='start')h.nodes.get('startButton').dispatch('click');
 else if(kind==='resume')h.nodes.get('resumeButton').dispatch('click');
 else {h.nodes.get('restartButton').dispatch('click');assert.equal(h.nodes.get('restartDialog').open,true);h.nodes.get('confirmRestart').dispatch('click');assert.equal(h.nodes.get('restartDialog').open,false);}
 assert.equal(h.workerMessages.filter(m=>m.type==='command').at(-1).name,kind);
}
function assertQuiescent(h){
 assert.equal(h.runtime.game.state,'paused');assert.equal(h.qa.read().state,'paused');
 assert.equal(h.qa.read().pauseRequested,false);assert.equal(h.qa.read().pendingInputs,0);assert.equal(h.outbox.length,0);
 assert.equal(h.qa.read().presentation.paused,true);assert.equal(h.runtime.stats().pendingTimers,0);
 const before=h.runtime.stats().steps;h.advance(5000);assert.equal(h.runtime.stats().steps,before,'paused time does not advance simulation');
 assert.equal(h.nodes.get('overlay').hidden,false);assert.equal(h.nodes.get('pausePanel').hidden,false);assert.equal(h.nodes.get('homePanel').hidden,true);
 assert.equal(h.nodes.get('resumeButton').disabled,false);assert(h.touchButtons.every(b=>b.disabled),'all real touch controls are disabled');
}
function deliverThrough(h,predicate){
 let delivered=0;
 while(h.outbox.length){const [worker,data]=h.outbox.shift();worker.onmessage({data});assert(++delivered<30,'bounded partial drain');if(predicate(data))return data;}
 assert.fail('expected queued message was not delivered');
}

test('frozen hotfix055 negative control: blur loses all three in-flight lifecycle commands',async()=>{
 for(const kind of ['start','resume','restart']){
  const h=await prepared(kind,{hotfixBaseline:true});try{
   const before=h.workerMessages.length;issueViaButton(h,kind);h.window.dispatch('blur');h.flush();h.advance(100);
   assert.equal(h.runtime.game.state,'playing',kind);assert.equal(h.qa.read().state,'playing',kind);assert(h.runtime.stats().steps>0,kind);
   assert.equal(h.workerMessages.slice(before).filter(m=>m.type==='command'&&m.name==='pause').length,0,kind);
  }finally{h.dispose();}
 }
});

for(const kind of ['start','resume','restart'])test(`056 blur during ${kind} stays paused through queued ACKs and epoch adoption`,async()=>{
 const h=await prepared(kind);try{
  const before=h.workerMessages.length;issueViaButton(h,kind);h.window.dispatch('blur');
  assert.equal(h.qa.read().pauseRequested,true);assert.equal(h.nodes.get('overlay').attributes['aria-busy'],'true');assert.equal(h.nodes.get('resumeButton').disabled,true);
  h.flush();assertQuiescent(h);
  const pauses=h.workerMessages.slice(before).filter(m=>m.type==='command'&&m.name==='pause');
  assert(pauses.length>0);if(kind==='restart'){assert.equal(h.runtime.epoch,2);assert(pauses.some(m=>m.epoch===2),'pause intent is resent in the adopted epoch');}
  h.window.dispatch('pageshow');h.flush();assertQuiescent(h);
  h.nodes.get('resumeButton').dispatch('click');h.flush();assert.equal(h.runtime.game.state,'playing');assert.equal(h.qa.read().state,'playing');
  assert.equal(h.nodes.get('overlay').hidden,true);assert(h.touchButtons.every(b=>!b.disabled));h.advance(100);assert(h.runtime.stats().steps>0);
 }finally{h.dispose();}
});

test('frozen hotfix055 negative control: settings opened during restart does not pause new round',async()=>{
 const h=await prepared('restart',{hotfixBaseline:true});try{
  issueViaButton(h,'restart');h.nodes.get('settingsButton').dispatch('click');h.flush();h.advance(100);
  assert.equal(h.nodes.get('settingsDialog').open,true);assert.equal(h.runtime.game.state,'playing');assert(h.runtime.stats().steps>0);
  assert(h.touchButtons.every(b=>b.disabled),'the dialog input guard works but cannot stop simulation');
 }finally{h.dispose();}
});

test('056 settings opened during start, resume or restart leaves a paused round behind the modal',async()=>{
 for(const kind of ['start','resume','restart']){
  const h=await prepared(kind);try{
   issueViaButton(h,kind);h.nodes.get('settingsButton').dispatch('click');assert.equal(h.nodes.get('settingsDialog').open,true);
   const count=h.workerMessages.length;
   h.window.dispatch('keydown',{code:'KeyP'});h.window.dispatch('keydown',{code:'Enter'});h.window.dispatch('keydown',{code:'ArrowLeft'});
   assert.equal(h.workerMessages.length,count,'open modal blocks lifecycle and movement keyboard commands');
   h.flush();assertQuiescent(h);h.nodes.get('settingsDialog').dispatch('cancel');
   assert.equal(h.nodes.get('settingsDialog').open,false);assert.equal(h.document.activeElement,h.nodes.get('settingsButton'));assertQuiescent(h);
  }finally{h.dispose();}
 }
});

test('real dialog selectors wire all close/cancel controls; closing never resumes and only one dialog opens',async()=>{
 const h=await prepared('resume');try{
  h.nodes.get('resumeButton').dispatch('click');h.flush();
  h.window.dispatch('keydown',{code:'ArrowLeft'});assert.equal(h.qa.read().heldInputs,1);
  h.nodes.get('headerHelp').dispatch('click');assert.equal(h.qa.read().heldInputs,0);assert.equal(h.nodes.get('helpDialog').open,true);
  h.nodes.get('settingsButton').dispatch('click');assert.equal(h.nodes.get('settingsDialog').open,false,'second dialog is not opened');h.flush();
  assertQuiescent(h);
  const helpClose=h.closeButtons.find(n=>n.dialogOwner===h.nodes.get('helpDialog'));assert(helpClose);helpClose.dispatch('click');
  assert.equal(h.nodes.get('helpDialog').open,false);assert.equal(h.document.activeElement,h.nodes.get('headerHelp'));assertQuiescent(h);
  h.nodes.get('restartButton').dispatch('click');assert.equal(h.nodes.get('restartDialog').open,true);h.nodes.get('cancelRestart').dispatch('click');
  assert.equal(h.nodes.get('restartDialog').open,false);h.flush();assert.equal(h.document.activeElement,h.nodes.get('restartButton'));assertQuiescent(h);
 }finally{h.dispose();}
});

test('frozen hotfix055 negative control: earlier resume ACK thaws presentation despite a later pause intent',async()=>{
 const h=await prepared('resume',{hotfixBaseline:true});try{
  issueViaButton(h,'resume');h.nodes.get('settingsButton').dispatch('click');assert.equal(h.qa.read().pauseRequested,true);
  deliverThrough(h,m=>m.type==='ack'&&m.name==='resume');
  assert.equal(h.qa.read().pauseRequested,true);assert.equal(h.qa.read().presentation.paused,false);
  h.flush();assertQuiescent(h);
 }finally{h.dispose();}
});

test('056 earlier resume ACK cannot thaw presentation while a newer pause or hidden request is outstanding',async()=>{
 for(const interrupt of ['dialog','hidden']){
  const h=await prepared('resume');try{
   issueViaButton(h,'resume');
   if(interrupt==='dialog')h.nodes.get('settingsButton').dispatch('click');else{h.document.hidden=true;h.document.dispatch('visibilitychange');}
   deliverThrough(h,m=>m.type==='ack'&&m.name==='resume');
   assert.equal(h.qa.read().pauseRequested,true);assert.equal(h.qa.read().presentation.paused,true);assert.equal(h.nodes.get('resumeButton').disabled,true);
   h.flush();assert.equal(h.runtime.game.state,'paused');assert.equal(h.qa.read().presentation.paused,true);assert.equal(h.qa.read().pendingInputs,0);
  }finally{h.dispose();}
 }
});

test('056 old paused snapshot and stale-round pause ACK cannot erase pause intent during restart',async()=>{
 for(const interrupt of ['blur','dialog']){
  const h=await bootRealWorker();try{
   h.flush();h.nodes.get('startButton').dispatch('click');h.flush();h.nodes.get('pauseButton').dispatch('click');
   deliverThrough(h,m=>m.type==='ack'&&m.name==='pause');
   assert.equal(h.qa.read().state,'paused');assert.equal(h.nodes.get('restartButton').disabled,false);
   assert(h.outbox.some(([,m])=>m.type==='snapshot-wire'&&m.epoch===1),'ordinary pause snapshot is still in transport');
   issueViaButton(h,'restart');
   if(interrupt==='blur')h.window.dispatch('blur');else h.nodes.get('settingsButton').dispatch('click');
   assert.equal(h.qa.read().pauseRequested,true);
   deliverThrough(h,m=>m.type==='snapshot-wire'&&m.epoch===1);
   assert.equal(h.qa.read().pauseRequested,true,'old paused snapshot cannot confirm the new-round pause');
   deliverThrough(h,m=>m.type==='ack'&&m.name==='pause'&&m.reason==='stale-round');
   assert.equal(h.qa.read().pauseRequested,true,'rejected old-epoch pause cannot confirm the new-round pause');
   h.flush();assert.equal(h.runtime.epoch,2);assertQuiescent(h);
   assert(h.workerMessages.some(m=>m.type==='command'&&m.name==='pause'&&m.epoch===2),'pause is delivered to the new round');
  }finally{h.dispose();}
 }
});

test('056 blur after start ACK but before its playing snapshot still pauses the worker',async()=>{
 const h=await bootRealWorker();try{
  h.flush();issueViaButton(h,'start');deliverThrough(h,m=>m.type==='ack'&&m.name==='start');
  assert(h.outbox.some(([,m])=>m.type==='snapshot-wire'),'playing snapshot is still awaiting main-thread receipt');
  h.window.dispatch('blur');h.flush();assertQuiescent(h);
 }finally{h.dispose();}
});

test('056 blur after restart ACK but before its new full snapshot still pauses the new epoch',async()=>{
 const h=await bootRealWorker();try{
  h.flush();issueViaButton(h,'start');h.flush();h.nodes.get('pauseButton').dispatch('click');deliverThrough(h,m=>m.type==='ack'&&m.name==='pause');
  issueViaButton(h,'restart');deliverThrough(h,m=>m.type==='ack'&&m.name==='restart');
  assert.equal(h.runtime.epoch,2);assert.equal(h.qa.read().presentation.epoch,1,'main thread has not adopted restart epoch');
  h.window.dispatch('blur');h.flush();assertQuiescent(h);assert.equal(h.qa.read().presentation.epoch,2);
 }finally{h.dispose();}
});

test('056 a same-epoch old paused snapshot cannot revoke a newer resume-then-blur pause request',async()=>{
 const h=await bootRealWorker();try{
  h.flush();issueViaButton(h,'start');h.flush();h.nodes.get('pauseButton').dispatch('click');deliverThrough(h,m=>m.type==='ack'&&m.name==='pause');
  assert(h.outbox.some(([,m])=>m.type==='snapshot-wire'&&m.epoch===1));
  issueViaButton(h,'resume');h.window.dispatch('blur');assert.equal(h.qa.read().pauseRequested,true);
  deliverThrough(h,m=>m.type==='snapshot-wire'&&m.epoch===1);assert.equal(h.qa.read().pauseRequested,true);
  h.flush();assertQuiescent(h);
 }finally{h.dispose();}
});

test('056 terminal over ACK satisfies a late pause without trapping the result behind a busy pause panel',async()=>{
 const h=await bootRealWorker();try{
  h.flush();await command(h,'qa-bridge',{fixture:'capacity'});assert.equal(h.qa.read().state,'playing');
  h.qa.command('drop');h.window.dispatch('blur');h.flush();
  assert.equal(h.runtime.game.state,'over');assert.equal(h.qa.read().state,'over');assert.equal(h.qa.read().pauseRequested,false);assert.equal(h.qa.read().pendingInputs,0);
  assert.equal(h.nodes.get('overPanel').hidden,false);assert.equal(h.nodes.get('pausePanel').hidden,true);assert.equal(h.nodes.get('overlay').attributes['aria-busy'],'false');
  const before=h.runtime.stats().steps;h.advance(5000);assert.equal(h.runtime.stats().steps,before);
 }finally{h.dispose();}
});

test('056 ready-page blur and settings pause are bounded no-ops and cannot auto-start the game',async()=>{
 const h=await bootRealWorker();try{
  h.flush();const before=h.workerMessages.length;for(let i=0;i<20;i++)h.window.dispatch('blur');h.nodes.get('settingsButton').dispatch('click');
  assert.equal(h.workerMessages.slice(before).filter(m=>m.type==='command'&&m.name==='pause').length,1,'concurrent repeated pause requests share one pending command');
  h.flush();assert.equal(h.runtime.game.state,'ready');assert.equal(h.qa.read().state,'ready');assert.equal(h.qa.read().pauseRequested,false);assert.equal(h.qa.read().pendingInputs,0);
  h.nodes.get('settingsDialog').dispatch('cancel');assert.equal(h.nodes.get('settingsDialog').open,false);
  assert.equal(h.nodes.get('homePanel').hidden,false);assert.equal(h.nodes.get('pausePanel').hidden,true);assert.equal(h.nodes.get('startButton').disabled,false);
  h.window.dispatch('pageshow');h.flush();h.advance(5000);assert.equal(h.runtime.game.state,'ready');assert.equal(h.runtime.stats().steps,0);assert.equal(h.runtime.stats().pendingTimers,0);
  assert.equal(h.workerMessages.filter(m=>m.type==='command'&&['start','resume','restart'].includes(m.name)).length,0);
 }finally{h.dispose();}
});

test('056 normal confirmed restart starts playing and does not inherit the confirmation dialog pause',async()=>{
 const h=await prepared('restart');try{
  issueViaButton(h,'restart');h.flush();h.advance(100);
  assert.equal(h.runtime.epoch,2);assert.equal(h.runtime.game.state,'playing');assert.equal(h.qa.read().state,'playing');assert.equal(h.qa.read().pauseRequested,false);
  assert.equal(h.qa.read().pendingInputs,0);assert.equal(h.nodes.get('overlay').hidden,true);assert(h.runtime.stats().steps>0);
 }finally{h.dispose();}
});
