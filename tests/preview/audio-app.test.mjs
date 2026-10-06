import test from'node:test';import assert from'node:assert/strict';import{harness}from'../dom-harness.mjs';
const flush=()=>Promise.resolve();
test('Actual preview app visibly separates synchronous start/audio from RAF and pending completion',async()=>{
 let h,context,resumeCalls=0,resolve;
 class MockAudio{constructor(){h.advance(45);this.state='suspended';context=this;}resume(){resumeCalls++;h.advance(3);return new Promise(r=>resolve=r);}}
 h=await harness({entry:'preview',AudioContext:MockAudio});h.el('startButton').dispatch('click',{timeStamp:0});assert.equal(h.api.game.state,'playing');assert.equal(resumeCalls,1);h.frame();
 let d=JSON.parse(h.el('qaOutput').textContent);assert.equal(d.startup.latest.audioSyncWallMs,48);assert.equal(d.startup.latest.handlerSyncWallMs,48);assert.equal(d.audio.unlock.lastConstructor.syncWallMs,45);assert.equal(d.audio.unlock.lastResume.syncWallMs,3);assert.equal(d.audio.unlock.pendingResume,true);assert(d.startup.latest.handlerToFirstDrawMs>=64);
 for(let i=0;i<12;i++){h.key('ArrowLeft');h.up('ArrowLeft');}assert.equal(resumeCalls,1);context.state='running';resolve();await flush();h.frame();d=JSON.parse(h.el('qaOutput').textContent);assert.equal(d.audio.unlock.lastResume.outcome,'resolved');assert.equal(d.audio.unlock.pendingResume,false);assert.equal(d.audio.unlock.counts.constructorCalls,1);assert.equal(d.audio.unlock.counts.resumeCalls,1);assert.equal(d.outputKind,'summary');assert(!('timing'in d));
});
test('Actual preview start remains playable if construction fails, and mute never constructs',async()=>{
 let calls=0;class BrokenAudio{constructor(){calls++;throw new Error('No audio device');}}
 const h=await harness({entry:'preview',AudioContext:BrokenAudio});h.el('startButton').dispatch('click');h.frame();assert.equal(h.api.game.state,'playing');assert.equal(calls,1);let d=JSON.parse(h.el('qaOutput').textContent);assert.equal(d.audio.unlock.counts.constructorErrors,1);
 h.el('soundToggle').checked=false;h.el('soundToggle').dispatch('change');h.el('restartButton').dispatch('click');h.key('Space');h.frame();assert.equal(h.api.game.state,'playing');assert.equal(calls,1);d=JSON.parse(h.el('qaOutput').textContent);assert.equal(d.startup.latest.soundEnabled,false);assert.equal(d.startup.latest.audioSyncWallMs,0);assert.equal(JSON.parse(h.storage.get('grainform.preview.v1.preferences')).sound,false);
});
test('Summary and ordinary app modes preserve audio behavior without exposing detailed timing',async()=>{
 for(const search of['?summary','']){let calls=0;class MockAudio{constructor(){calls++;this.state='running';}}
  const h=await harness({entry:'preview',search,AudioContext:MockAudio});h.el('startButton').dispatch('click');h.frame();h.key('ArrowRight');h.up('ArrowRight');assert.equal(calls,1);assert.equal(h.api,undefined);
  if(search){const d=JSON.parse(h.el('qaOutput').textContent);assert.equal(d.game.state,'playing');assert.equal(d.audio.unlock,undefined);assert.equal(d.startup,undefined);}else assert.equal(h.el('qaDiagnostics').hidden,true);
 }
});
test('Keyboard start retains original event timing in visible startup diagnostics',async()=>{
 const h=await harness({entry:'preview',initial:{'grainform.preview.v1.preferences':'{"sound":false}'}});h.advance(100);h.key('Enter',{timeStamp:98});h.frame();const d=JSON.parse(h.el('qaOutput').textContent);assert.equal(d.game.state,'playing');assert.equal(d.startup.latest.eventAtMs,98);assert.equal(d.startup.latest.handlerBeginAtMs,100);assert.equal(d.startup.latest.audioSyncWallMs,0);
});
test('The existing tone path still produces sound events and respects mute then unmute without recreation',async()=>{
 let notes=0,creates=0;const param={setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){}};
 class MockAudio{constructor(){creates++;this.state='running';this.currentTime=1;this.destination={};}createGain(){return{gain:param,connect(){},disconnect(){}};}createOscillator(){return{frequency:param,connect(){},disconnect(){},start(){notes++;},stop(){Promise.resolve().then(()=>this.onended?.());}};}}
 const h=await harness({entry:'preview',AudioContext:MockAudio});h.el('startButton').dispatch('click');h.key('ArrowUp');h.up('ArrowUp');assert.equal(notes,1);
 h.el('soundToggle').checked=false;h.el('soundToggle').dispatch('change');h.key('ArrowUp');h.up('ArrowUp');assert.equal(notes,1);
 h.el('soundToggle').checked=true;h.el('soundToggle').dispatch('change');assert.equal(notes,2);h.key('ArrowUp');h.up('ArrowUp');assert.equal(notes,3);assert.equal(creates,1);await flush();
});
test('Actual app retries pending resume on new activation and explicit sound-enable without new context',async()=>{
 let creates=0,calls=0;class MockAudio{constructor(){creates++;this.state='suspended';}resume(){calls++;return new Promise(()=>{});}}
 const h=await harness({entry:'preview',AudioContext:MockAudio});h.window.navigator={userActivation:{isActive:false}};h.api.start();h.key('ArrowLeft');h.up('ArrowLeft');assert.equal(calls,1);
 h.window.navigator.userActivation.isActive=true;h.key('ArrowLeft');h.up('ArrowLeft');assert.equal(calls,2);h.key('ArrowRight');h.up('ArrowRight');assert.equal(calls,2);
 h.el('soundToggle').checked=false;h.el('soundToggle').dispatch('change');h.el('soundToggle').checked=true;h.el('soundToggle').dispatch('change');assert.equal(calls,3);assert.equal(creates,1);h.frame();const d=JSON.parse(h.el('qaOutput').textContent);assert.equal(d.game.state,'playing');assert.equal(d.audio.unlock.lastResume.retryReason,'explicit-request');assert.equal(d.audio.unlock.outstandingResumePromises,3);
});
