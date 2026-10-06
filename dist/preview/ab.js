import{GrainRenderer}from'./renderer.js';import{BaselineRenderer}from'./baseline-renderer.js';import{SCENES,makeComparison,tickComparison,comparisonState}from'./fixtures.js';
const oldRender=new BaselineRenderer(document.querySelector('#before')),newRender=new GrainRenderer(document.querySelector('#after'));
let scene='landing',pair=makeComparison(scene),paused=false,last=0,acc=0,samples=[],lastState;
const $=s=>document.querySelector(s);
function restart(key=scene){scene=key;pair=makeComparison(key);paused=false;acc=0;last=performance.now();samples=[];$('#pause').textContent='暂停';$('#description').textContent=SCENES[key].description;for(const b of document.querySelectorAll('[data-scene]'))b.setAttribute('aria-pressed',String(b.dataset.scene===key));oldRender.lastRevision=-1;newRender.lastRevision=-1;}
for(const b of document.querySelectorAll('[data-scene]'))b.addEventListener('click',()=>restart(b.dataset.scene));$('#replay').addEventListener('click',()=>restart());$('#pause').addEventListener('click',()=>{paused=!paused;$('#pause').textContent=paused?'继续':'暂停';last=performance.now();acc=0;});
window.addEventListener('resize',()=>{oldRender.resize();newRender.resize();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){paused=true;$('#pause').textContent='继续';}last=performance.now();acc=0;});
function frame(now){const begin=performance.now(),dt=last?Math.min(100,Math.max(0,now-last)):0;last=now;
  if(!paused&&!pair.finished){acc+=dt;let n=0;while(acc>=1000/60&&n++<6){tickComparison(pair);acc-=1000/60;}}
  oldRender.draw(pair.baseline,{ghost:false});newRender.draw(pair.fine,{ghost:false});
  $('#time').textContent=`${(pair.tick/60).toFixed(1).padStart(4,'0')} / 13.0 秒${pair.finished?' · 完成，可重播':paused?' · 已暂停':''}`;
  if(pair.tick%6===0||paused||pair.finished){lastState=comparisonState(pair);const show=m=>`颗粒 ${m.rawGrains.toLocaleString()} · 等量 ${m.normalizedGrains.toFixed(0)}\n标记沙堆宽 ${m.markedWidth.toFixed(1)} · 守恒 ${m.conserved?'通过':'异常'}${m.activeChunks!==null?'\n活跃分块 '+m.activeChunks:''}`;$('#beforeStats').textContent=show(lastState.baseline);$('#afterStats').textContent=show(lastState.fine);$('#diagnostics').textContent=JSON.stringify({build:"grainform-fine-0.2.1",...lastState,physicsGridFixed:true,renderDpr:Math.min(2,devicePixelRatio||1),recentWorkP95:samples.length?[...samples].sort((a,b)=>a-b)[Math.floor(samples.length*.95)]:0},null,2);}
  samples.push(performance.now()-begin);if(samples.length>900)samples.shift();requestAnimationFrame(frame);
}
restart();requestAnimationFrame(frame);
