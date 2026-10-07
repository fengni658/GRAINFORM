import{BLOCK,WIDTH,HEIGHT}from'./engine.js';
import{textureOffset}from'../palette.js';
import{RASTER_SCALE,grainPalette,grainIndex,grainAppearance,writeGrain}from'./grain-raster.js';
import{dirtyBuild}from'./raster-cache.js';
import{buildSurfaceRegion}from'./surface-grains.js';
import{SurfaceGPU}from'./surface-gpu.js';
import{drawSurfaceLayers}from'./surface-layer.js';
const NORMAL=[[12,17,19],[234,195,112],[79,192,179],[211,120,163]];
const ACCESSIBLE=[[12,17,19],[255,218,120],[69,146,212],[241,114,182]];
export class GrainRenderer{
  constructor(canvas,{baseline=false,surfaceBackend='auto',directDisplay=false}={}){
    this.canvas=canvas;this.baseline=baseline;this.directDisplay=!!directDisplay&&!baseline;this.surfaceBackend=surfaceBackend;this.surfaceGPU=null;this.gpuAttempted=false;this.boardSource=null;this.lastBackendEpoch=-1;this.ctx=canvas.getContext('2d',{alpha:this.directDisplay});
    this.buffer=document.createElement('canvas');this.sprite=document.createElement('canvas');this.lastRevision=-1;this.lastPalette=null;this.spriteKey='';this.lastState='';this.presented=null;
    canvas.style.imageRendering=baseline?'pixelated':'auto';this.resize();
  }
  backendSnapshot(){return this.surfaceGPU?{...this.surfaceGPU.snapshot(),displayMode:this.layerMounted?'direct-webgl-plus-2d':'offscreen-copy',gpuLayerVisible:!!this.layerVisible,coveredRevision:this.layerVisible?null:this.layerCoveredRevision,visualSession:this.layerSession||0}:{backend:'cpu',reason:this.surfaceBackend==='cpu'?'requested-cpu-reference':'not-initialized',scope:'CPU reference preserves the larger surface; dense full rebuild cost remains a known limitation.'};}
  resize(){const r=this.canvas.getBoundingClientRect?this.canvas.getBoundingClientRect():{width:384,height:576},dpr=this.baseline?1:Math.min(2,Math.max(1,window.devicePixelRatio||1));
    const w=this.baseline?384:Math.max(1,Math.round(r.width*dpr)),h=this.baseline?576:Math.max(1,Math.round(r.height*dpr));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.presented=null;}
  }
  spriteFor(game,colors,contrast){
    const a=game.active;if(!a)return;
    const b=this.baseline?8:BLOCK,key=JSON.stringify([a.shape,a.color,a.materialSeed,contrast]);if(key===this.spriteKey)return;this.spriteKey=key;
    const w=(Math.max(...a.shape.map(p=>p[0]))+1)*b,h=(Math.max(...a.shape.map(p=>p[1]))+1)*b;
    const scale=this.baseline?1:RASTER_SCALE;this.sprite.width=w*scale;this.sprite.height=h*scale;const ctx=this.sprite.getContext('2d'),im=ctx.createImageData(w*scale,h*scale),words=new Uint32Array(im.data.buffer),packed=grainPalette(contrast);
    const grid=new Uint8Array(w*h),material=new Uint8Array(w*h);
    for(const [bx,by]of a.shape)for(let y=0;y<b;y++)for(let x=0;x<b;x++){
      const gx=bx*b+x,gy=by*b+y,p=(gy*w+gx)*4,mat=this.baseline?((gx*3+gy*5)%7)*30:game.materialFor(gx,gy,a.materialSeed||game.seed);
      const shade=(this.baseline?0:(mat%15-7)*.65+(y===0?7:0))+(contrast?textureOffset(a.color,gx,gy)*.6:0);
      if(this.baseline){for(let c=0;c<3;c++)im.data[p+c]=colors[a.color][c]+shade;im.data[p+3]=255;}
      else{grid[gy*w+gx]=a.color;material[gy*w+gx]=mat;}
    }
    if(!this.baseline){buildSurfaceRegion({words,im},grid,material,w,h,contrast);for(let i=0;i<grid.length;i++)if(!grid[i]){const x=i%w,y=(i/w)|0,p=y*2*w*2+x*2;words[p]=words[p+1]=words[p+w*2]=words[p+w*2+1]=0;}}
    ctx.putImageData(im,0,0);
  }
  draw(game,{contrast=false,motion=false,ghost=true,profile=null,generation=game.generation??0}={}){
    if(!this.baseline&&!this.gpuAttempted&&this.surfaceBackend!=='cpu'){this.gpuAttempted=true;this.surfaceGPU=new SurfaceGPU();}
    this.surfaceGPU?.poll();if(this.directDisplay&&drawSurfaceLayers(this,game,{contrast,motion,ghost,profile,generation}))return;const backendEpoch=this.surfaceGPU?.epoch||0;
    const w=game.width,h=game.height,colors=contrast?ACCESSIBLE:NORMAL,revision=this.baseline?game.tick:game.gridVersion,ready=game.state==='ready',active=game.active,p=this.presented;
    // An opaque board plus the same ghost/sprite produces exactly the same final pixels.
    // Reuse only when every visual input and canvas backing size is unchanged.
    if(!this.baseline&&!this.gpuDeferred&&p&&p.backendEpoch===backendEpoch&&this.lastRevision===revision&&p.game===game&&p.revision===revision&&p.state===game.state&&p.contrast===contrast&&p.motion===motion&&p.ghost===ghost&&p.clearing===!!game.clearTimer&&p.width===this.canvas.width&&p.height===this.canvas.height&&p.active===!!active&&(!active||(p.x===active.x&&p.y===active.y&&p.shape===active.shape&&p.color===active.color&&p.materialSeed===active.materialSeed))){
      if(profile)profile.rendered(null,true,game.state==='playing');return;
    }
    const phases=profile?{pixelBuild:0,pixelUpload:0,boardComposite:0,ghost:0,spriteBuild:0,spriteComposite:0}:null;let at=phases?performance.now():0;

    const raster=this.baseline?1:RASTER_SCALE,rw=w*raster,rh=h*raster;
    if(this.buffer.width!==rw||this.buffer.height!==rh){this.buffer.width=rw;this.buffer.height=rh;this.pctx=this.buffer.getContext('2d',{alpha:false});this.im=this.pctx.createImageData(rw,rh);this.words=new Uint32Array(this.im.data.buffer,this.im.data.byteOffset,this.im.data.byteLength/4);this.readyGrid=new Uint8Array(w*h);this.readyMaterial=null;this.appearanceCodes=new Uint8Array(w*h);this.pairEligibility=new Uint8Array(w*h);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const wx=x/(w/96),wy=y/(h/144),floor=128-Math.sin(wx/18)*8-Math.cos(wx/10)*4;if(wy>floor)this.readyGrid[y*w+x]=wy>136+Math.sin(wx/9)*3?2:wx<51?1:3;}
      this.lastRevision=-1;
    }
    if(this.lastBackendEpoch!==backendEpoch||game!==this.lastGame||revision!==this.lastRevision||contrast!==this.lastPalette||game.state!==this.lastState||game.clearTimer){
      let gpuCanvas=null,gpuDeferred=false;
      if(!this.baseline&&this.surfaceGPU?.ready){
       if(ready&&!this.readyMaterial){this.readyMaterial=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)this.readyMaterial[y*w+x]=((Math.imul(x+1,73856093)^Math.imul(y+1,19349663))>>>8)&255;}
       gpuCanvas=this.surfaceGPU.draw(ready?this.readyGrid:game.grid,ready?this.readyMaterial:game.material,w,h,{contrast,clearMask:game.clearTimer&&!motion?game.clearMask:null,revision,playing:game.state==='playing',generation,tick:game.tick});gpuDeferred=this.surfaceGPU.lastOutcome==='deferred';
      }
      if(gpuCanvas){this.dirtyState=null;this.boardSource=gpuCanvas;}
      else if(!gpuDeferred){this.boardSource=this.buffer;
      if(this.baseline){
      const data=this.im.data,g=game.grid;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=y*w+x,p=i*4;let c=g[i],shade=0;
        if(ready){const wx=x/(w/96),wy=y/(h/144),floor=128-Math.sin(wx/18)*8-Math.cos(wx/10)*4;if(wy>floor)c=wy>136+Math.sin(wx/9)*3?2:wx<51?1:3;}
        if(c){
          if(this.baseline)shade=(((i*17+Math.floor(i/w)*13)%7)-3)*4;
          else{
            const mat=ready?((Math.imul(x+1,73856093)^Math.imul(y+1,19349663))>>>8)&255:game.material[i];shade=(mat%15-7)*.65;
            if(!ready){if(y===0||!g[i-w])shade+=9;if(x===0||!g[i-1]||x===w-1||!g[i+1])shade+=3;}
          }
          if(contrast)shade+=textureOffset(c,x,y)*.6;
        }
        if(game.clearTimer&&game.clearMask[i]&&!motion)shade+=24;
        data[p]=colors[c][0]+shade;data[p+1]=colors[c][1]+shade;data[p+2]=colors[c][2]+shade;data[p+3]=255;
      }
      }else{
      const g=ready?this.readyGrid:game.grid,packed=grainPalette(contrast),words=this.words;
      if(!ready){if(this.lastRevision<0)this.dirtyState=null;dirtyBuild(this,game,contrast,motion);}
      else{this.dirtyState=null;
       if(!this.readyMaterial){this.readyMaterial=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)this.readyMaterial[y*w+x]=((Math.imul(x+1,73856093)^Math.imul(y+1,19349663))>>>8)&255;}
       buildSurfaceRegion(this,g,this.readyMaterial,w,h,contrast);
      }
      }
      }
      if(phases){const end=performance.now();phases.pixelBuild=end-at;at=end;}
      if(!gpuDeferred&&!gpuCanvas)this.pctx.putImageData(this.im,0,0);if(phases){const end=performance.now();phases.pixelUpload=end-at;at=end;}this.gpuDeferred=gpuDeferred;if(!gpuDeferred){this.lastBackendEpoch=this.surfaceGPU?.epoch||0;this.lastGame=game;this.lastRevision=revision;this.lastPalette=contrast;this.lastState=game.state;}
    }else this.gpuDeferred=false;
    const ctx=this.ctx,s=this.canvas.width/w;ctx.imageSmoothingEnabled=!this.baseline;ctx.imageSmoothingQuality='high';ctx.drawImage(this.boardSource||this.buffer,0,0,this.canvas.width,this.canvas.height);if(phases){const end=performance.now();phases.boardComposite=end-at;at=end;}
    if(game.active){const a=game.active,b=this.baseline?8:BLOCK;
      if(ghost){ctx.strokeStyle=`rgba(${colors[a.color].join(',')},.2)`;ctx.lineWidth=Math.max(1,s*.6);ctx.setLineDash([3*s,3*s]);const gy=game.ghostY();for(const[x,y]of a.shape)ctx.strokeRect((a.x+x*b)*s+s,(gy+y*b)*s+s,(b-2)*s,(b-2)*s);ctx.setLineDash([]);}
      if(phases){const end=performance.now();phases.ghost=end-at;at=end;}
      this.spriteFor(game,colors,contrast);if(phases){const end=performance.now();phases.spriteBuild=end-at;at=end;}
      ctx.drawImage(this.sprite,a.x*s,a.y*s,this.sprite.width*s/raster,this.sprite.height*s/raster);if(phases)phases.spriteComposite=performance.now()-at;
    }
    this.presented={backendEpoch:this.surfaceGPU?.epoch||0,game,revision,state:game.state,contrast,motion,ghost,clearing:!!game.clearTimer,width:this.canvas.width,height:this.canvas.height,active:!!active,x:active?.x,y:active?.y,shape:active?.shape,color:active?.color,materialSeed:active?.materialSeed};
    if(profile)profile.rendered(phases,false,game.state==='playing');
  }
}
