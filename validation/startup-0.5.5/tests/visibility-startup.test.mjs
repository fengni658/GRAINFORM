import test from 'node:test';
import assert from 'node:assert/strict';
import {bootRealWorker} from './real-worker-boot-harness.mjs';
// Actual app and worker code, actual native canvas; event loop and DOM are doubles.
// This proves the protocol race deterministically, not the screenshot's cause.
async function command(h,name,value){const promise=h.qa.command(name,value);h.flush();return await promise;}
function visible(h,hidden){h.document.hidden=hidden;h.document.dispatch('visibilitychange');h.flush();}
async function raced(baseline){const h=await bootRealWorker({hidden:true,baseline});h.document.hidden=false;h.document.dispatch('visibilitychange');assert.equal(h.workerMessages.at(-1).epoch,0);assert.equal(h.runtime.stats().hidden,true);h.flush();return h;}

test('negative control: baseline real app/worker race starts paused and refuses resume',async()=>{
 const h=await raced(true);try{assert.equal(h.runtime.stats().hidden,true);const start=await command(h,'start');assert.equal(start.applied,true);assert.equal(h.qa.read().state,'paused');const resume=await command(h,'resume');assert.equal(resume.applied,false);assert.equal(h.runtime.game.state,'paused');assert.equal(h.runtime.stats().steps,0);}finally{h.dispose();}
});
test('hotfix: same race syncs epoch and explicit start/pause/resume works',async()=>{
 const h=await raced(false);try{assert.equal(h.runtime.stats().hidden,false);assert.equal(h.qa.read().state,'ready');assert.equal((await command(h,'start')).state,'playing');h.advance(100);assert(h.runtime.stats().steps>0,'simulation ticks advance after start');assert.equal((await command(h,'pause')).state,'paused');assert.equal((await command(h,'resume')).state,'playing');assert.equal(h.qa.read().pendingInputs,0);assert.equal(h.outbox.length,0);}finally{h.dispose();}
});
test('explicit resume repairs stale hidden flag, but visible event never auto-resumes',async()=>{
 const h=await bootRealWorker();try{h.flush();await command(h,'start');h.window.dispatch('pagehide');h.flush();assert.equal(h.runtime.game.state,'paused');assert.equal(h.runtime.stats().hidden,true);assert.equal(h.document.hidden,false);const before=h.workerMessages.length;assert.equal((await command(h,'resume')).state,'playing');assert.equal(h.workerMessages[before].type,'visibility');assert.equal(h.workerMessages[before].hidden,false);assert.equal(h.workerMessages[before+1].name,'resume');visible(h,true);visible(h,false);assert.equal(h.runtime.game.state,'paused');assert.equal(h.qa.read().state,'paused');assert.equal((await command(h,'resume')).state,'playing');}finally{h.dispose();}
});
test('hidden explicit resume refuses locally and hidden restart stays paused',async()=>{
 const h=await bootRealWorker();try{h.flush();await command(h,'start');visible(h,true);const before=h.workerMessages.length;assert.equal((await command(h,'resume')).applied,false);assert.equal(h.workerMessages.length,before);assert.equal(h.runtime.game.state,'paused');await command(h,'restart',{seed:2});assert.equal(h.runtime.epoch,2);assert.equal(h.runtime.stats().hidden,true);assert.equal(h.runtime.game.state,'paused');visible(h,false);assert.equal(h.runtime.game.state,'paused');assert.equal((await command(h,'resume')).state,'playing');}finally{h.dispose();}
});
test('old-epoch messages cannot pause/resume or corrupt new round',async()=>{
 const h=await bootRealWorker();try{h.flush();await command(h,'start');await command(h,'restart',{seed:3});await command(h,'snapshot');assert.equal(h.runtime.epoch,2);assert.equal(h.qa.read().state,'playing');h.runtime.receive({type:'visibility',hidden:true,epoch:1});h.runtime.receive({type:'command',id:999,name:'pause',epoch:1});h.flush();assert.equal(h.runtime.stats().hidden,false);assert.equal(h.runtime.game.state,'playing');assert.equal(h.qa.read().state,'playing');h.emit({type:'visibility',hidden:true,state:'paused',epoch:1});assert.equal(h.qa.read().state,'playing');assert.equal(h.qa.read().awaitingFullSync,false);}finally{h.dispose();}
});
test('repeated visible/pageshow messages drain linearly; same-epoch full sync does not loop',async()=>{
 const h=await raced(false);try{await command(h,'start');await command(h,'pause');const before=h.workerMessages.length,posts=h.posts.length;for(let i=0;i<100;i++){h.document.dispatch('visibilitychange');h.window.dispatch('pageshow');}assert.equal(h.flush(),200);assert.equal(h.workerMessages.length-before,200);assert.equal(h.posts.length-posts,200);assert.equal(h.runtime.game.state,'paused');const n=h.workerMessages.filter(m=>m.type==='visibility').length;h.qa.resync();assert(h.flush()<10);assert.equal(h.workerMessages.filter(m=>m.type==='visibility').length,n);assert.equal(h.outbox.length,0);assert.equal(h.qa.read().pendingInputs,0);}finally{h.dispose();}
});
test('new worker boot gets independent visibility/epoch state after previous hidden disposal',async()=>{
 const old=await bootRealWorker();old.flush();await command(old,'start');visible(old,true);old.dispose();const h=await raced(false);try{assert.equal(h.workers.length,1);assert.notEqual(h.runtime,old.runtime);assert.equal(h.runtime.epoch,1);assert.equal(h.runtime.stats().hidden,false);assert.equal((await command(h,'start')).state,'playing');}finally{h.dispose();}
});
