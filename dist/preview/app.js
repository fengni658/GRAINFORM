import {Game, WIDTH, HEIGHT, BLOCK, SCALE, CONNECTIVITY} from './engine.js';
import {GrainRenderer} from './renderer.js';
import {InputState} from '../input.js';
import {SessionMetrics} from '../metrics.js';
import {CallbackMetrics} from './callback-metrics.js';
import {SimulationBudget,CommittedView} from './simulation-budget.js';
import {FrameDiagnostics} from './diagnostics.js';
import {AudioUnlock,StartDiagnostics} from './audio-unlock.js';
import {diagnosticMode,DiagnosticOutput,compactSession} from './diagnostic-output.js';
import {STANDARD_COLORS,ACCESSIBLE_COLORS,COLOR_NAMES,PATTERN_NAMES,textureOffset} from '../palette.js';
const BUILD='grainform-fine-0.4.0';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const game=new Game({seed:randomSeed()}),input=new InputState();
const canvas=$('#gameCanvas'),sceneRenderer=new GrainRenderer(canvas);
window.addEventListener('resize',()=>{sceneRenderer.resize();uiDirty=true;});
if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{sceneRenderer.resize();uiDirty=true;}).observe(canvas.parentElement);
const defaults={sound:true,contrast:false,motion:matchMedia('(prefers-reduced-motion: reduce)').matches};
let storageOK=true,prefs={...defaults},best=0;
try{
  let saved=null;try{saved=JSON.parse(localStorage.getItem('grainform.preview.v1.preferences')||'null');}catch{}
  if(saved&&typeof saved==='object')for(const k in defaults)if(typeof saved[k]==='boolean')prefs[k]=saved[k];
  const n=Number(localStorage.getItem('grainform.preview.v1.best'));if(Number.isSafeInteger(n)&&n>=0)best=n;
  localStorage.setItem('grainform.preview.v1.storageCheck','1');localStorage.removeItem('grainform.preview.v1.storageCheck');
}catch{storageOK=false;}
let colors,shades,toastUntil=0,lastTime=0,uiDirty=true,lastSavedScore=-1,newBest=false,lastNext=null;
const audioStats={notesStarted:0,activeVoices:0,errors:0};
let audioCtx=null,rafId=0,frameIndex=0,frameTotal=0,frameWork=new Float32Array(3600),frameGap=new Float32Array(3600),frameStart=performance.now();
const sessionMetrics=new SessionMetrics(frameStart),callbackMetrics=new CallbackMetrics();
const diagnosticsMode=diagnosticMode(location.search),qaEnabled=diagnosticsMode==='profile';
const diagnosticOutput=new DiagnosticOutput(diagnosticsMode);
$('#qaDiagnostics').hidden=diagnosticsMode==='off';
const frameDiagnostics=qaEnabled?new FrameDiagnostics():null;
if(frameDiagnostics){frameDiagnostics.instrument(game);frameDiagnostics.observe();}
const simulationBudget=new SimulationBudget(),committedView=new CommittedView(game),deferredInput=[];
const inputLatency={received:0,applied:0,cancelled:0,maxLatencyMs:0,maxQueueWaitMs:0,maxDispatchDelayMs:0,slowest:[]};
const audioUnlock=new AudioUnlock({diagnostics:qaEnabled,activation:()=>window.navigator?.userActivation?.isActive??null,createContext:()=>new (window.AudioContext||window.webkitAudioContext)()});
const startDiagnostics=new StartDiagnostics({enabled:qaEnabled});let shownAudioRevision=-1,shownStartRevision=-1;
function randomSeed(){try{return crypto.getRandomValues(new Uint32Array(1))[0];}catch{return Date.now()>>>0;}}
const storageFailure='本地存储暂时不可用，部分更改未保存。已有记录可能仍保留，本次仍可游戏。';
const failedWrites=new Set();
function save(key,value){
  try{localStorage.setItem(key,value);failedWrites.delete(key);storageOK=true;$('#storageNotice').textContent=failedWrites.size?storageFailure:'设置与最高分仅保存在当前浏览器';return true;}
  catch{failedWrites.add(key);storageOK=false;$('#storageNotice').textContent=storageFailure;return false;}
}
function setText(el,value){if(el.textContent!==String(value))el.textContent=value;}
const compactScore=new Intl.NumberFormat('zh-CN',{notation:'compact',maximumFractionDigits:1});
function displayScore(node,value){
  const mobile=node.closest('.mobile-hud'),full=value.toLocaleString();
  setText(node,mobile&&value>=10000?compactScore.format(value):full);
  node.setAttribute('aria-label',full);node.title=full;
  if(node.classList.contains('big-score'))node.style.fontSize=`${Math.min(3.375,12/(Math.max(1,full.length)*.58))}rem`;
}
function announce(text){$('#announcer').textContent=text;}
function applyPrefs(){
  document.body.classList.toggle('high-contrast',prefs.contrast);document.body.classList.toggle('reduced-motion',prefs.motion);
  $('#soundToggle').checked=prefs.sound;$('#contrastToggle').checked=prefs.contrast;$('#motionToggle').checked=prefs.motion;
  colors=prefs.contrast?ACCESSIBLE_COLORS:STANDARD_COLORS;
  shades=colors.map(c=>Array.from({length:7},(_,n)=>c.map(v=>Math.max(0,Math.min(255,v+(n-3)*4)))));
  lastNext=null;uiDirty=true;
}
function unlockAudio(source='input'){audioCtx=audioUnlock.unlock(prefs.sound,source,{retryPending:source==='start'||source==='sound-toggle'})||audioCtx;}
function tone(freq,duration=.08,volume=.035,type='sine',delay=0){
  if(!prefs.sound||!audioCtx||audioCtx.state!=='running')return;
  try{const now=audioCtx.currentTime+delay,o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(freq,now);o.frequency.exponentialRampToValueAtTime(freq*.7,now+duration);g.gain.setValueAtTime(0,now);g.gain.linearRampToValueAtTime(volume,now+.006);g.gain.exponentialRampToValueAtTime(.0001,now+duration);o.connect(g);g.connect(audioCtx.destination);o.start(now);audioStats.notesStarted++;audioStats.activeVoices++;o.stop(now+duration+.02);o.onended=()=>{audioStats.activeVoices=Math.max(0,audioStats.activeVoices-1);o.disconnect();g.disconnect();};}catch{audioStats.errors++;}
}
function sound(type,chain=1){if(type==='land')tone(110,.1,.03,'triangle');if(type==='rotate')tone(340,.035,.015);if(type==='clear'){const notes=[440,554.37,659.25,880];notes.forEach((v,i)=>tone(v*Math.min(2,1+(chain-1)*.12),.18,.024,'sine',i*.055));}if(type==='over'){tone(220,.25,.03,'triangle');tone(146.83,.35,.025,'triangle',.15);}}
function clearInput(){inputLatency.cancelled+=deferredInput.length;deferredInput.length=0;input.clear();$$('[data-action]').forEach(b=>b.classList.remove('held'));}
function panel(name){
  $('#overlay').hidden=!name;for(const n of ['home','pause','over'])$('#'+n+'Panel').hidden=n!==name;
  if(name)$('#overlay').setAttribute('aria-labelledby',{home:'overlayTitle',pause:'pauseTitle',over:'overTitle'}[name]);
  canvas.setAttribute('tabindex',name?'-1':'0');
}
function start(event){
  if($('#settingsDialog').open||$('#helpDialog').open)return;
  const startup=startDiagnostics.begin(event,prefs.sound);startDiagnostics.beforeAudio(startup);unlockAudio('start');startDiagnostics.afterAudio(startup);clearInput();game.reset(randomSeed());game.start();simulationBudget.reset();committedView.capture(true);sceneRenderer.lastRevision=-1;sceneRenderer.presented=null;lastSavedScore=-1;newBest=false;toastUntil=0;$('#toast').classList.remove('visible');panel(null);uiDirty=true;lastTime=performance.now();announce('游戏开始。方向键移动和旋转，空格直接落下。');
  canvas.focus({preventScroll:true});startDiagnostics.finish(startup);
}
function pause(reason='游戏已暂停',moveFocus=true){
  if(game.pause()){clearInput();panel('pause');$('#pauseReason').textContent=reason;uiDirty=true;announce(reason);if(moveFocus)$('#resumeButton').focus({preventScroll:true});return true;}return false;
}
function resume(){if($('#settingsDialog').open||$('#helpDialog').open)return false;if(game.resume()){clearInput();panel(null);uiDirty=true;lastTime=performance.now();canvas.focus({preventScroll:true});announce('游戏继续');return true;}return false;}
function togglePause(){if(game.state==='playing')pause();else if(game.state==='paused')resume();}
function action(name,event=null){
  if(game.state!=='playing')return false;
  const handlerAt=performance.now(),eventAt=Number.isFinite(event?.timeStamp)&&event.timeStamp>=0&&event.timeStamp<=handlerAt+1?event.timeStamp:handlerAt;
  const item={name,handlerAt,eventAt,eventTimeSource:eventAt===handlerAt?'handler-clock':'event-timestamp'};inputLatency.received++;
  // Audio unlock remains inside the actual user gesture; it is not moved out of latency measurements.
  unlockAudio('input:'+name);let result;
  if(game.stepPending||deferredInput.length){item.queuedAt=performance.now();deferredInput.push(item);result=true;}else result=applyAction(item);
  if(frameDiagnostics)frameDiagnostics.inputAction(name,handlerAt,performance.now()-handlerAt);return result;
}
function applyAction(item){
  const {name}=item,applyAt=performance.now();let result=false;
  if(name==='left')result=game.move(-4*SCALE);if(name==='right')result=game.move(4*SCALE);if(name==='rotate')result=game.rotate();if(name==='drop')result=game.hardDrop();if(name==='down')result=game.nudgeDown();
  uiDirty=true;handleEvents();committedView.capture();
  const appliedAt=performance.now(),latency=Math.max(0,appliedAt-item.eventAt),wait=item.queuedAt===undefined?0:Math.max(0,applyAt-item.queuedAt);
  inputLatency.applied++;inputLatency.maxLatencyMs=Math.max(inputLatency.maxLatencyMs,latency);inputLatency.maxQueueWaitMs=Math.max(inputLatency.maxQueueWaitMs,wait);inputLatency.maxDispatchDelayMs=Math.max(inputLatency.maxDispatchDelayMs,item.handlerAt-item.eventAt);
  if(qaEnabled){inputLatency.slowest.push({...item,appliedAt,latencyMs:latency,queueWaitMs:wait,result});inputLatency.slowest.sort((a,b)=>b.latencyMs-a.latencyMs);inputLatency.slowest.length=Math.min(6,inputLatency.slowest.length);}return result;
}
function flushInput(){while(deferredInput.length&&game.state==='playing'&&!game.stepPending)applyAction(deferredInput.shift());}
function simulationState(detail=false){const {slowest,...counts}=inputLatency;return{...simulationBudget.snapshot(game),renderedTick:committedView.view.tick,input:{scope:'Discrete movement, rotate, drop and accelerate only. Pause/restart/settings are immediate; GPU presentation and audible sound are not measured here.',...counts,pending:deferredInput.length,oldestPendingMs:deferredInput.length?Math.max(0,performance.now()-deferredInput[0].eventAt):0,...(detail?{slowest}:{} )},inputPolicy:'Ordered application at completed-step boundaries. Pause, restart, blur or dialog input clearing cancels unapplied requests and counts cancellations; no slowdown-based dropping.'};}

function handleEvents(){for(const event of game.consumeEvents()){
  uiDirty=true;
  if(event.type==='land'||event.type==='rotate')sound(event.type);
  if(event.type==='clear'){
    sound('clear',event.chain);showToast(event.chain>1?`${event.chain} 连锁`:'整片消除',`+${event.score.toLocaleString()} · ${event.rawCount.toLocaleString()} 粒`);
    announce(`${event.chain}连锁，消除${event.rawCount.toLocaleString()}粒，增加${event.score}分`);
  }
  if(event.type==='over'){
    clearInput();sound('over');panel('over');const end=$('#endScore');end.textContent=game.score.toLocaleString();end.style.fontSize=`clamp(1rem, ${Math.min(3.25,10/(Math.max(1,end.textContent.length)*.62))}rem, 9vw)`;$('#endRecord').textContent=game.score>best?'新的本地最高纪录':`本地最高 ${best.toLocaleString()}`;
    $('#endDetails').innerHTML=`<span><strong>${game.pieces}</strong>个方块</span><span><strong>${game.rawCleared.toLocaleString()}</strong>粒沙</span><span><strong>${game.maxChain}</strong>最高连锁</span>`;announce(`本局结束，得分${game.score}，消除${game.rawCleared.toLocaleString()}粒`);$('#againButton').focus({preventScroll:true});
  }
}}
function showToast(title,subtitle){$('#toast').replaceChildren(document.createTextNode(title));const small=document.createElement('small');small.textContent=subtitle;$('#toast').append(small);$('#toast').classList.add('visible');toastUntil=performance.now()+1450;}
function readStoredBest(fallback=best){
  try{const n=Number(localStorage.getItem('grainform.preview.v1.best'));return Number.isSafeInteger(n)&&n>=0?n:fallback;}catch{return fallback;}
}
function updateUI(){
  if(game.score!==lastSavedScore){const stored=readStoredBest();if(stored>best){best=stored;newBest=false;}if(game.score>best){best=game.score;newBest=true;save('grainform.preview.v1.best',String(best));}lastSavedScore=game.score;}
  $$('[data-score]').forEach(n=>displayScore(n,game.score));$$('[data-best]').forEach(n=>displayScore(n,best));$$('[data-level]').forEach(n=>setText(n,String(game.level).padStart(2,'0')));$$('[data-cleared]').forEach(n=>setText(n,game.rawCleared.toLocaleString()));$$('[data-chain]').forEach(n=>setText(n,game.maxChain));
  $('#levelProgress').style.width=`${(game.rawCleared%16200)/162}%`;
  $('#pauseButton').disabled=!['playing','paused'].includes(game.state);$('#pauseButton').setAttribute('aria-label',game.state==='paused'?'继续游戏':'暂停游戏');
  $('#pauseButton').innerHTML=game.state==='paused'?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 10 7-10 7Z"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>';
  const labels={ready:'准备就绪',playing:'流动中',paused:'已暂停',over:'本局结束'};setText($('#stateLabel'),labels[game.state]);$('#stateDot').classList.toggle('live',game.state==='playing');
  setText($('#chainCaption'),game.maxChain>1?`最高 ${game.maxChain} 连锁`:'每一粒，都算数');
  if(game.state==='over')$('#endRecord').textContent=newBest?'新的本地最高纪录':`本地最高 ${best.toLocaleString()}`;
  $$('[data-action]').forEach(b=>b.disabled=game.state!=='playing');
  if(lastNext!==game.next){drawNext();lastNext=game.next;}
  uiDirty=false;
}
function cssColor(c,alpha=1){const rgb=colors[c];return `rgba(${rgb.join(',')},${alpha})`;}
function drawPattern(context,color,x,y,size){
  if(!prefs.contrast)return;
  const grain=size/BLOCK;
  for(let gy=0;gy<BLOCK;gy++)for(let gx=0;gx<BLOCK;gx++){
    const offset=textureOffset(color,gx,gy);if(Math.abs(offset)<20)continue;
    context.fillStyle=offset<0?'rgba(0,0,0,.32)':'rgba(255,255,255,.48)';
    context.fillRect(x+gx*grain,y+gy*grain,grain,grain);
  }
}
function drawNext(){
  for(const target of [$('#nextCanvas'),$('#nextMobile')]){
    const c=target.getContext('2d');c.clearRect(0,0,target.width,target.height);const shape=game.next.shape;
    const w=Math.max(...shape.map(p=>p[0]))+1,h=Math.max(...shape.map(p=>p[1]))+1,size=target.id==='nextMobile'?19:25;
    const ox=(target.width-w*size)/2,oy=(target.height-h*size)/2;
    for(const [x,y]of shape){c.fillStyle=cssColor(game.next.color);c.fillRect(ox+x*size,oy+y*size,size-2,size-2);drawPattern(c,game.next.color,ox+x*size,oy+y*size,size-2);c.fillStyle='#ffffff22';c.fillRect(ox+x*size,oy+y*size,size-2,2);}
  }setText($('#nextColor'),COLOR_NAMES[game.next.color]+(prefs.contrast?' · '+PATTERN_NAMES[game.next.color]:''));
}
function draw(){sceneRenderer.draw(committedView.capture(),{contrast:prefs.contrast,motion:prefs.motion,profile:frameDiagnostics});}
function frame(now){
  const callbackBegin=performance.now();callbackMetrics.commitPending();
  const begin=performance.now(),gap=lastTime?now-lastTime:16.667,wasPlaying=game.state==='playing';lastTime=now;
  const phases=frameDiagnostics?{inputRepeat:0,simulation:0,events:0,hud:0,render:0,diagnostics:0}:null;let n=0,at=begin;
  if(game.state==='playing'&&!document.hidden){
    const result=simulationBudget.run(game,gap,{
      beforeStep(){flushInput();input.step(dx=>game.move(dx*SCALE));committedView.capture();if(phases){const end=performance.now();phases.inputRepeat+=end-at;at=end;}return{softDrop:input.has('down')};},
      onChunk(){if(phases){const end=performance.now();phases.simulation+=end-at;at=end;}},
      afterStep(){handleEvents();committedView.capture();if(phases){const end=performance.now();phases.events+=end-at;at=end;}}
    });n=result.steps;
    if(n&&(game.next!==lastNext||game.score!==lastSavedScore))uiDirty=true;
  }
  if(uiDirty)updateUI();if(phases){const end=performance.now();phases.hud=end-at;at=end;}
  draw();if(phases){const end=performance.now();phases.render=end-at;at=end;if(game.state==='playing')startDiagnostics.noteDraw(now,begin,end);}
  if(toastUntil&&now>toastUntil){$('#toast').classList.remove('visible');toastUntil=0;}
  // Audio/startup revisions are rare user-gesture transitions; publish their small
  // current records promptly without exporting full live frame history.
  if(qaEnabled&&(shownAudioRevision!==audioUnlock.revision||shownStartRevision!==startDiagnostics.revision))diagnosticOutput.lastAt=-Infinity;
  const outputKind=diagnosticOutput.next(now,game.state,wasPlaying);
  if(outputKind){
    const state=game.snapshot(),data={build:BUILD,rules:{connectivity:CONNECTIVITY,sameColor:true,requiredWalls:['left','right']},diagnosticsMode,outputKind,game:state,audio:{enabled:prefs.sound,contextState:audioCtx?.state||'not-created',...audioStats},particleBalance:{present:state.grains,added:game.added,removed:game.removed,conserved:state.grains===game.added-game.removed},session:outputKind==='full'?sessionMetrics.snapshot(now):compactSession(sessionMetrics,now)};
    data.simulation=simulationState(outputKind==='full');
    data.callback=callbackMetrics.snapshot({detail:outputKind==='full'});
    // Keep adverse samples and observer records; serialize them only after playing has stopped.
    if(qaEnabled){data.audio.unlock=audioUnlock.snapshot({detail:outputKind==='full'});data.startup=startDiagnostics.snapshot({detail:outputKind==='full'});shownAudioRevision=audioUnlock.revision;shownStartRevision=startDiagnostics.revision;}
    if(outputKind==='full')data.timing=frameDiagnostics.snapshot();
    $('#qaOutput').textContent=JSON.stringify(data,null,2);
  }
  const end=performance.now(),work=end-begin;if(phases)phases.diagnostics=end-at;
  sessionMetrics.record(work,gap,wasPlaying,now,performance.memory);
  if(frameDiagnostics)frameDiagnostics.recordFrame({frameId:frameTotal+1,now,begin:callbackBegin,gap,work,playing:wasPlaying,steps:n,phases});
  frameWork[frameIndex]=work;frameGap[frameIndex]=gap;frameIndex=(frameIndex+1)%frameWork.length;frameTotal++;
  callbackMetrics.prepare(frameTotal,now,wasPlaying,n,callbackBegin,begin,end,frameDiagnostics?.previousFrame);
  rafId=requestAnimationFrame(frame);
  callbackMetrics.finish(performance.now());
}
$('#startButton').addEventListener('click',start);$('#againButton').addEventListener('click',start);$('#resumeButton').addEventListener('click',resume);$('#restartButton').addEventListener('click',start);$('#pauseButton').addEventListener('click',togglePause);
const dialogOpeners=new WeakMap();
function openDialog(dialog,opener){
  dialogOpeners.set(dialog,opener);pause('关闭面板后，点击继续游戏',false);clearInput();dialog.showModal();
}
$('#settingsButton').addEventListener('click',()=>openDialog($('#settingsDialog'),$('#settingsButton')));
for(const id of ['howButton','helpButton','endHowButton','footerHelp','landscapeHelp'])$('#'+id).addEventListener('click',()=>openDialog($('#helpDialog'),$('#'+id)));
$$('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
$$('dialog').forEach(d=>{
  d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});
  d.addEventListener('close',()=>{
    clearInput();$('#resetConfirm').hidden=true;$('#resetBest').hidden=false;
    const opener=dialogOpeners.get(d);
    if(opener&&!opener.disabled&&!opener.closest('[hidden]')&&opener.getClientRects().length)opener.focus({preventScroll:true});
    else {
      const target={ready:'#startButton',paused:'#resumeButton',over:'#againButton'}[game.state];
      (target?$(target):canvas).focus({preventScroll:true});
    }
  });
});
for(const [id,key] of [['soundToggle','sound'],['contrastToggle','contrast'],['motionToggle','motion']])$('#'+id).addEventListener('change',e=>{prefs[key]=e.target.checked;applyPrefs();save('grainform.preview.v1.preferences',JSON.stringify(prefs));if(key==='sound'&&prefs.sound){unlockAudio('sound-toggle');tone(440,.1,.025);}});
function finishReset(){
  $('#resetConfirm').hidden=true;$('#resetBest').hidden=false;$('#resetBest').focus({preventScroll:true});
}
$('#resetBest').addEventListener('click',()=>{$('#resetStatus').hidden=true;$('#resetConfirm').hidden=false;$('#resetBest').hidden=true;$('#cancelReset').focus({preventScroll:true});});
$('#cancelReset').addEventListener('click',finishReset);
$('#confirmReset').addEventListener('click',()=>{
  const saved=save('grainform.preview.v1.best','0');
  if(saved){best=0;newBest=false;lastSavedScore=game.score;}
  else best=Math.max(best,readStoredBest(best));
  uiDirty=true;finishReset();
  const message=saved?'本地最高分已清除':'未能清除已保存记录。最高分仍保留，请稍后重试。';
  $('#resetStatus').textContent=message;$('#resetStatus').hidden=false;
  announce(message);
});
const keyMap={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowUp:'rotate',KeyW:'rotate',ArrowDown:'down',KeyS:'down',Space:'drop'};
window.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey||e.isComposing)return;
  if($('#settingsDialog').open||$('#helpDialog').open)return;
  if(e.code==='KeyP'||e.code==='Escape'){e.preventDefault();if(!e.repeat)togglePause();return;}
  if(e.code==='Enter'&&['ready','over'].includes(game.state)&&!['BUTTON','INPUT','A'].includes(document.activeElement.tagName)){e.preventDefault();if(!e.repeat)start(e);return;}
  const name=keyMap[e.code];if(!name||game.state!=='playing')return;
  if(['BUTTON','INPUT','A'].includes(document.activeElement.tagName)&&e.code==='Space')return;
  e.preventDefault();if(!e.repeat&&input.press('key:'+e.code,name))action(name,e);
});
function releaseInput(id){input.release(id);$$('[data-action]').forEach(button=>button.classList.toggle('held',input.has(button.dataset.action)));}
window.addEventListener('keyup',e=>{releaseInput('key:'+e.code);});
$$('[data-action]').forEach(b=>{
  b.addEventListener('pointerdown',e=>{if(game.state!=='playing')return;e.preventDefault();b.setPointerCapture(e.pointerId);const name=b.dataset.action;const trigger=input.press('pointer:'+e.pointerId,name);b.classList.add('held');if(trigger)action(name,e);});
  const release=e=>{releaseInput('pointer:'+e.pointerId);};b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);
  // Assistive technology / keyboard-generated click. Real pointer clicks already act on pointerdown.
  b.addEventListener('click',e=>{if(e.detail===0)action(b.dataset.action,e);});
});
window.addEventListener('blur',()=>{clearInput();pause('你刚刚离开了窗口，游戏已自动暂停',false);});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();pause('页面切到后台，游戏已自动暂停',false);}});
window.addEventListener('storage',event=>{
  if(event.key!=='grainform.preview.v1.best'&&event.key!==null)return;
  const incoming=Number(event.newValue);
  if(!Number.isSafeInteger(incoming)||incoming<0)return;
  // Read the current value, since queued storage events can describe an older write.
  const current=readStoredBest(incoming);
  if(current===0){best=0;newBest=false;uiDirty=true;return;}
  if(current<best){save('grainform.preview.v1.best',String(best));return;}
  if(current>best){best=current;newBest=false;uiDirty=true;}
});
window.addEventListener('pagehide',()=>{clearInput();pause('游戏已暂停',false);});
if(!storageOK)$('#storageNotice').textContent=storageFailure;
applyPrefs();updateUI();draw();rafId=requestAnimationFrame(frame);
function readState(){return {...game.snapshot(),best,preferences:{...prefs},storageAvailable:storageOK};}
// Progressive enhancement: no external agent SDK and no network access are needed.
const context=document.modelContext;
if(context?.registerTool){
  const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
  for(const tool of [
    {name:'read_grainform_state',description:'Read the visible game status, score and device-local settings.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(input){if(input&&Object.keys(input).length)throw new Error('No input fields are accepted');return readState();}},
    {name:'pause_grainform_game',description:'Pause a running game using the same pause action as the visible interface. Does not start, resume, or reset a game.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(input&&Object.keys(input).length)throw new Error('No input fields are accepted');pause('游戏已暂停');updateUI();return readState();}}
  ])try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}
}
if(qaEnabled){
  window.__grainform={game,input,start,pause,resume,action,readState,render(){uiDirty=true;committedView.capture(true);sceneRenderer.lastRevision=-1;sceneRenderer.presented=null;updateUI();draw();},metrics(){const count=Math.min(frameTotal,frameWork.length),a=Array.from(frameWork.slice(0,count)).sort((x,y)=>x-y),b=Array.from(frameGap.slice(0,count)).sort((x,y)=>x-y);return {simulation:simulationState(true),session:sessionMetrics.snapshot(performance.now()),callback:callbackMetrics.snapshot({detail:true}),frames:frameTotal,elapsedMs:performance.now()-frameStart,sampleFrames:count,workP50:a[Math.floor(count*.5)]||0,workP95:a[Math.floor(count*.95)]||0,workMax:a[count-1]||0,frameGapP95:b[Math.floor(count*.95)]||0,heap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null};}};
}
