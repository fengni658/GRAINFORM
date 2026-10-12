import test from 'node:test';
import assert from 'node:assert/strict';
import {bootFocusRuntime,candidateHTML} from './focus-real-worker-harness.mjs';

// Actual app + runtime + transport + Canvas; controlled DOM/focus/key defaults.
// Never report this suite as browser Tab/focus/native keyboard verification.
const commands=(h,from=0)=>h.workerMessages.slice(from).filter(m=>m.type==='command').map(m=>m.name);
async function boot(options){return await bootFocusRuntime(options);}
function syncControl(h){if(h.qa.read().state!==h.runtime.game.state){h.advance(50);assert.equal(h.qa.read().state,h.runtime.game.state,'next scheduled runtime callback publishes post-restart play state');}}
function activate(h,button,code){const result=h.modelButtonActivation(button,code);syncControl(h);return result;}
async function playing(h){await h.command(h.qa.read().state==='ready'?'start':'restart',{seed:1});syncControl(h);assert.equal(h.qa.read().state,'playing');assert.equal(h.qa.read().phase,'falling');}
async function over(h){if(h.qa.read().state==='ready')await playing(h);h.runtime.game.endGame('focus-test-fixture');await h.command('snapshot');assert.equal(h.qa.read().state,'over');}
function press(h,node,code,details={}){node.focus();const down=h.key('keydown',code,details);h.key('keyup',code);h.flush();syncControl(h);return down;}
function nativeTargets(h){
 const editable=h.makeFixture('div',{contenteditable:'true'}),inherited=h.makeFixture('span',{},editable);
 return [h.nodes.get('settingsButton'),h.nodes.get('headerHelp'),h.allNodes.find(n=>n.tagName==='A'),h.allNodes.find(n=>n.tagName==='SUMMARY'),h.nodes.get('soundToggle'),h.makeFixture('textarea'),h.makeFixture('select'),editable,inherited,h.makeFixture('div',{role:'button'}),h.makeFixture('div',{role:'link'})];
}

test('056 negative control: ready/over Enter steals focused buttons, links, summary and editable targets',async()=>{
 const h=await boot({baseline056:true});try{
  const button=h.nodes.get('headerHelp');let from=h.workerMessages.length;
  assert.equal(press(h,button,'Enter').defaultPrevented,true);assert.deepEqual(commands(h,from),['start']);assert.equal(h.nodes.get('helpDialog').open,false);
  for(const node of [h.nodes.get('settingsButton'),h.allNodes.find(n=>n.tagName==='A'),h.allNodes.find(n=>n.tagName==='SUMMARY'),h.makeFixture('div',{contenteditable:'true'})]){
   await over(h);from=h.workerMessages.length;assert.equal(press(h,node,'Enter').defaultPrevented,true);assert.deepEqual(commands(h,from),['restart']);
  }
 }finally{h.dispose();}
});

test('056 negative control: BUTTON Space was already protected; link/summary/editable Space was intercepted',async()=>{
 const h=await boot({baseline056:true});try{
  await playing(h);
  for(const button of [h.nodes.get('settingsButton'),h.nodes.get('headerHelp'),...h.touchButtons]){const from=h.workerMessages.length;assert.equal(press(h,button,'Space').defaultPrevented,false);assert.deepEqual(commands(h,from),[]);}
  for(const node of [h.allNodes.find(n=>n.tagName==='A'),h.allNodes.find(n=>n.tagName==='SUMMARY'),h.makeFixture('div',{contenteditable:'true'})]){
   await playing(h);const from=h.workerMessages.length;assert.equal(press(h,node,'Space').defaultPrevented,true);assert.deepEqual(commands(h,from),['drop']);
  }
 }finally{h.dispose();}
});

test('059 interactive targets retain Enter/Space and all editing keys in ready, playing and over',async()=>{
 const h=await boot();try{
  const targets=nativeTargets(h);
  for(const state of ['ready','playing','over']){
   if(state==='playing')await playing(h);if(state==='over')await over(h);
   for(const target of targets)for(const code of ['Enter','Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS','KeyP','Escape']){
    const from=h.workerMessages.length,event=press(h,target,code);assert.equal(event.defaultPrevented,false,`${state} ${target.tagName} ${code}`);assert.deepEqual(commands(h,from),[],`${state} ${target.tagName} ${code}`);
   }
   assert.equal(h.qa.read().state,state);
  }
 }finally{h.dispose();}
});

test('059 closest checks ancestors; isContentEditable inherits and honors explicit false islands',async()=>{
 const h=await boot();try{
  const button=h.nodes.get('settingsButton'),child=h.makeFixture('span',{},button),link=h.allNodes.find(n=>n.tagName==='A'),linkChild=h.makeFixture('span',{},link);
  const editor=h.makeFixture('div',{contenteditable:'plaintext-only'}),editableChild=h.makeFixture('span',{},editor),island=h.makeFixture('span',{contenteditable:'false'},editor),islandChild=h.makeFixture('span',{},island);
  assert.equal(child.closest('button, a[href]'),button);assert.equal(linkChild.closest('button, a[href]'),link);assert.equal(editableChild.isContentEditable,true);assert.equal(island.isContentEditable,false);assert.equal(islandChild.isContentEditable,false);
  for(const target of [child,linkChild,editableChild]){const from=h.workerMessages.length;assert.equal(press(h,target,'Enter').defaultPrevented,false);assert.deepEqual(commands(h,from),[]);}
  // A false editing island is not itself an editable control. Its unchanged
  // fallback behavior also proves the guard is not simply [contenteditable].
  const from=h.workerMessages.length;assert.equal(press(h,islandChild,'Enter').defaultPrevented,true);assert.deepEqual(commands(h,from),['start']);
 }finally{h.dispose();}
});

test('059 body/canvas retain Enter start/restart, movement, rotation, drop and P/Escape',async()=>{
 const h=await boot();try{
  const canvas=h.nodes.get('gameCanvas'),body=h.document.body;let from=h.workerMessages.length;
  assert.equal(press(h,body,'Enter').defaultPrevented,true);assert.deepEqual(commands(h,from),['start']);assert.equal(h.qa.read().state,'playing');
  for(const node of [canvas,body]){
   for(const [code,action]of [['ArrowLeft','left'],['ArrowRight','right'],['ArrowUp','rotate'],['ArrowDown','down'],['KeyA','left'],['KeyD','right'],['KeyW','rotate'],['KeyS','down']]){from=h.workerMessages.length;assert.equal(press(h,node,code).defaultPrevented,true);assert.deepEqual(commands(h,from),[action]);assert.equal(h.qa.read().heldInputs,0);}
   for(const code of ['KeyP','Escape']){from=h.workerMessages.length;press(h,node,code);assert.equal(h.qa.read().state,'paused');press(h,node,code);assert.equal(h.qa.read().state,'playing');assert.deepEqual(commands(h,from),['pause','resume']);}
   from=h.workerMessages.length;assert.equal(press(h,node,'Space').defaultPrevented,true);assert.deepEqual(commands(h,from),['drop']);assert.equal(h.runtime.game.pieces,1);
   await over(h);from=h.workerMessages.length;assert.equal(press(h,node,'Enter').defaultPrevented,true);assert.deepEqual(commands(h,from),['restart']);assert.equal(h.qa.read().state,'playing');
  }
 }finally{h.dispose();}
});

test('059 handled events and modal layer do not receive any global game shortcuts',async()=>{
 const h=await boot();try{
  const canvas=h.nodes.get('gameCanvas');canvas.focus();let from=h.workerMessages.length;
  h.key('keydown','Enter',{defaultPrevented:true});assert.deepEqual(commands(h,from),[]);assert.equal(h.qa.read().state,'ready');
  await playing(h);canvas.focus();from=h.workerMessages.length;
  for(const code of ['Space','ArrowLeft','KeyP'])h.key('keydown',code,{defaultPrevented:true});assert.deepEqual(commands(h,from),[]);assert.equal(h.qa.read().state,'playing');
  activate(h,h.nodes.get('settingsButton'),'Enter');assert.equal(h.nodes.get('settingsDialog').open,true);assert.equal(h.qa.read().state,'paused');
  from=h.workerMessages.length;
  for(const code of ['Enter','Space','ArrowLeft','ArrowUp','KeyP','Escape']){const event=h.key('keydown',code,{target:canvas});assert.equal(event.defaultPrevented,false);h.key('keyup',code,{target:canvas});}
  assert.deepEqual(commands(h,from),[]);
  // Explicit dialog-cancel model: the production cancel handler is real, but
  // a browser's Escape-to-cancel synthesis is intentionally not claimed.
  h.nodes.get('settingsDialog').dispatch('cancel');h.flush();assert.equal(h.nodes.get('settingsDialog').open,false);assert.equal(h.document.activeElement,h.nodes.get('settingsButton'));assert.equal(h.qa.read().state,'paused');
 }finally{h.dispose();}
});

test('059 keyup releases holds after focus enters controls or modal; repeats remain bounded',async()=>{
 const h=await boot();try{
  await playing(h);const canvas=h.nodes.get('gameCanvas');canvas.focus();let from=h.workerMessages.length;
  h.key('keydown','ArrowLeft');h.flush();assert.equal(h.qa.read().heldInputs,1);assert.equal(h.timers.size,1);h.key('keydown','ArrowLeft',{repeat:true});h.key('keydown','ArrowLeft');assert.deepEqual(commands(h,from),['left']);
  h.nodes.get('settingsButton').focus();h.key('keyup','ArrowLeft');assert.equal(h.qa.read().heldInputs,0);assert.equal(h.timers.size,0);
  canvas.focus();h.key('keydown','ArrowLeft');h.flush();assert.equal(h.qa.read().heldInputs,1);activate(h,h.nodes.get('headerHelp'),'Enter');assert.equal(h.qa.read().heldInputs,0);assert.equal(h.timers.size,0);h.key('keyup','ArrowLeft');
  h.nodes.get('helpDialog').dispatch('cancel');h.flush();await h.command('resume');canvas.focus();from=h.workerMessages.length;h.key('keydown','ArrowLeft');h.key('keyup','ArrowLeft');h.flush();assert.deepEqual(commands(h,from),['left']);assert.equal(h.qa.read().heldInputs,0);
 }finally{h.dispose();}
});

test('059 button default-action model opens help/settings once without start, restart or drop',async()=>{
 const h=await boot();try{
  for(const state of ['ready','playing','over']){
   if(state==='playing')await playing(h);if(state==='over')await over(h);
   for(const [buttonId,dialogId]of [['headerHelp','helpDialog'],['settingsButton','settingsDialog']])for(const code of ['Enter','Space']){
    if(state==='playing'&&h.qa.read().state==='paused')await h.command('resume');
    const from=h.workerMessages.length,result=activate(h,h.nodes.get(buttonId),code);assert.equal(result.down.defaultPrevented,false);assert.equal(result.clicks,1);assert.equal(h.nodes.get(dialogId).open,true);assert.deepEqual(commands(h,from),['pause']);
    h.nodes.get(dialogId).dispatch('cancel');h.flush();
   }
  }
 }finally{h.dispose();}
});

test('059 button default-action model emits exactly one start/restart and one command per touch control',async()=>{
 const h=await boot();try{
  let from=h.workerMessages.length,result=activate(h,h.nodes.get('startButton'),'Enter');assert.equal(result.clicks,1);assert.deepEqual(commands(h,from),['start']);
  for(const code of ['Enter','Space']){
   await over(h);from=h.workerMessages.length;result=activate(h,h.nodes.get('againButton'),code);assert.equal(result.clicks,1);assert.deepEqual(commands(h,from),['restart']);
   for(const button of h.touchButtons){await playing(h);from=h.workerMessages.length;result=activate(h,button,code);assert.equal(result.clicks,1);assert.deepEqual(commands(h,from),[button.dataset.action]);assert.equal(h.qa.read().heldInputs,0);}
  }
 }finally{h.dispose();}
});

test('059 pointer click does not double-submit and keyboard-style click remains single',async()=>{
 const h=await boot();try{
  await playing(h);const left=h.touchButtons.find(b=>b.dataset.action==='left');let from=h.workerMessages.length;
  left.dispatch('pointerdown',{button:0,pointerId:3});left.dispatch('pointerup',{pointerId:3});left.dispatch('click',{detail:1});h.flush();assert.deepEqual(commands(h,from),['left']);assert.equal(h.qa.read().heldInputs,0);assert.equal(left.classList.contains('held'),false);
  from=h.workerMessages.length;left.dispatch('click',{detail:0});h.flush();assert.deepEqual(commands(h,from),['left']);
 }finally{h.dispose();}
});

test('059 fixed six-color copy matches all six existing legend IDs',()=>{
 assert.match(candidateHTML,/提高六色的明度和色相差异/);assert.doesNotMatch(candidateHTML,/提高四色的明度和色相差异/);
 const names=[...candidateHTML.matchAll(/id="grainColor([1-6])"/g)].map(m=>m[1]);assert.deepEqual(names,['1','2','3','4','5','6']);
});

test('059 Space Start default-action model submits exactly one start',async()=>{
 const h=await boot();try{const from=h.workerMessages.length,result=activate(h,h.nodes.get('startButton'),'Space');assert.equal(result.down.defaultPrevented,false);assert.equal(result.clicks,1);assert.deepEqual(commands(h,from),['start']);assert.equal(h.qa.read().state,'playing');}finally{h.dispose();}
});
