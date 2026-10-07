// Ordinary-game-only presentation. GPU pixels never cross into Canvas2D here.
import {buildSurfaceRegion} from './surface-grains.js';
import {dirtyBuild} from './raster-cache.js';
import {BLOCK} from './engine.js';
const NORMAL=[[12,17,19],[234,195,112],[79,192,179],[211,120,163]],ACCESSIBLE=[[12,17,19],[255,218,120],[69,146,212],[241,114,182]];
function allocate(r,w,h){
 if(r.buffer.width===w*2&&r.buffer.height===h*2&&r.im)return;
 r.buffer.width=w*2;r.buffer.height=h*2;r.pctx=r.buffer.getContext('2d',{alpha:false});r.im=r.pctx.createImageData(w*2,h*2);r.words=new Uint32Array(r.im.data.buffer);r.readyGrid=new Uint8Array(w*h);r.readyMaterial=new Uint8Array(w*h);r.dirtyState=null;r.layerCpuKey=null;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,wx=x/(w/96),wy=y/(h/144),floor=128-Math.sin(wx/18)*8-Math.cos(wx/10)*4;if(wy>floor)r.readyGrid[i]=wy>136+Math.sin(wx/9)*3?2:wx<51?1:3;r.readyMaterial[i]=((Math.imul(x+1,73856093)^Math.imul(y+1,19349663))>>>8)&255;}
}
function mount(r){
 if(r.layerMounted)return true;const host=r.canvas.parentElement,gpu=r.surfaceGPU;if(!host||host.id!=='boardShell'||!host.insertBefore||!gpu)return false;
 const layer=gpu.canvas;Object.assign(layer.style,{position:'absolute',inset:'0',width:'100%',height:'100%',zIndex:'0',pointerEvents:'none',display:'none',imageRendering:'auto'});layer.setAttribute?.('aria-hidden','true');layer.tabIndex=-1;
 Object.assign(r.canvas.style,{position:'relative',zIndex:'0'});host.insertBefore(layer,r.canvas);r.layerMounted=true;return true;
}
export function drawSurfaceLayers(r,game,{contrast=false,motion=false,ghost=true,profile=null,generation=0}={}){
 if(!mount(r))return false;
 const gpu=r.surfaceGPU,w=game.width,h=game.height,ready=game.state==='ready',revision=game.gridVersion,active=game.active;
 if(r.layerGame!==game||r.layerGeneration!==generation){r.layerGame=game;r.layerGeneration=generation;r.layerSession=(r.layerSession||0)+1;r.layerSubmittedKey=null;r.layerCpuKey=null;r.layerPresented=null;r.dirtyState=null;gpu.canvas.style.display='none';}
 const token=r.layerSession,phases=profile?{pixelBuild:0,pixelUpload:0,boardComposite:0,ghost:0,spriteBuild:0,spriteComposite:0}:null;let at=performance.now();allocate(r,w,h);
 const boardKey=[token,gpu.epoch,w,h,ready,revision,contrast,motion,!!game.clearTimer].join(':'),needsBoard=r.layerSubmittedKey!==boardKey||r.lastRevision<0||!!game.clearTimer;
 let submitted=false,deferred=false;
 if(gpu.ready&&needsBoard){
  const result=gpu.draw(ready?r.readyGrid:game.grid,ready?r.readyMaterial:game.material,w,h,{contrast,clearMask:game.clearTimer&&!motion?game.clearMask:null,revision,playing:game.state==='playing',generation:token,tick:game.tick});
  submitted=!!result;deferred=gpu.lastOutcome==='deferred';if(submitted){r.layerSubmittedKey=boardKey;r.lastRevision=revision;r.lastBackendEpoch=gpu.epoch;}
 }
 const completed=gpu.lastCompleted,visible=!!(gpu.ready&&completed&&completed.generation===token&&completed.epoch===gpu.epoch);
 // A new game/context remains covered by one CPU snapshot until its own GPU
 // work completes. Old-generation pixels cannot reappear after restart.
 const cpuKey=visible?null:[token,gpu.epoch,w,h,ready,contrast,motion,gpu.ready?'generation-cover':revision,!!game.clearTimer].join(':');
 let cpuBuilt=false;
 if(!visible&&(r.layerCpuKey!==cpuKey||(!gpu.ready&&(game.clearTimer||r.lastRevision<0)))){
  if(ready){r.dirtyState=null;buildSurfaceRegion(r,r.readyGrid,r.readyMaterial,w,h,contrast);}
  else dirtyBuild(r,game,contrast,motion);
  if(phases){const end=performance.now();phases.pixelBuild=end-at;at=end;}r.pctx.putImageData(r.im,0,0);if(phases){const end=performance.now();phases.pixelUpload=end-at;at=end;}
  r.layerCpuKey=cpuKey;r.layerCoveredRevision=revision;cpuBuilt=true;if(!gpu.ready)r.lastRevision=revision;
 }else if(phases){const end=performance.now();phases.pixelBuild=end-at;at=end;}
 const p=r.layerPresented,same=p&&p.visible===visible&&p.cpuKey===cpuKey&&p.revision===revision&&p.state===game.state&&p.contrast===contrast&&p.motion===motion&&p.ghost===ghost&&p.width===r.canvas.width&&p.height===r.canvas.height&&p.active===!!active&&(!active||(p.x===active.x&&p.y===active.y&&p.shape===active.shape&&p.color===active.color&&p.materialSeed===active.materialSeed));
 r.layerVisible=visible;r.layerDeferred=deferred;gpu.canvas.style.display=visible?'block':'none';
 if(same&&!cpuBuilt&&!submitted){if(profile)profile.rendered(null,true,game.state==='playing');return true;}
 const ctx=r.ctx,s=r.canvas.width/w,colors=contrast?ACCESSIBLE:NORMAL;
 ctx.clearRect(0,0,r.canvas.width,r.canvas.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';if(!visible)ctx.drawImage(r.buffer,0,0,r.canvas.width,r.canvas.height);
 if(phases){const end=performance.now();phases.boardComposite=end-at;at=end;}
 if(active){
  if(ghost){ctx.strokeStyle=`rgba(${colors[active.color].join(',')},.2)`;ctx.lineWidth=Math.max(1,s*.6);ctx.setLineDash([3*s,3*s]);const gy=game.ghostY();for(const[x,y]of active.shape)ctx.strokeRect((active.x+x*BLOCK)*s+s,(gy+y*BLOCK)*s+s,(BLOCK-2)*s,(BLOCK-2)*s);ctx.setLineDash([]);}
  if(phases){const end=performance.now();phases.ghost=end-at;at=end;}r.spriteFor(game,colors,contrast);if(phases){const end=performance.now();phases.spriteBuild=end-at;at=end;}
  ctx.drawImage(r.sprite,active.x*s,active.y*s,r.sprite.width*s/2,r.sprite.height*s/2);if(phases)phases.spriteComposite=performance.now()-at;
 }
 r.layerPresented={visible,cpuKey,revision,state:game.state,contrast,motion,ghost,width:r.canvas.width,height:r.canvas.height,active:!!active,x:active?.x,y:active?.y,shape:active?.shape,color:active?.color,materialSeed:active?.materialSeed};
 if(profile)profile.rendered(phases,false,game.state==='playing');return true;
}
