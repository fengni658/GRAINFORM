import{BLOCK,WIDTH,HEIGHT}from'./reference-0.4-r1-engine.js';
import{textureOffset}from'../palette.js';
import{RASTER_SCALE,grainPalette,cornerMask,writeGrain}from'./reference-0.4-r1-raster.js';
const NORMAL=[[12,17,19],[234,195,112],[79,192,179],[211,120,163]];
const ACCESSIBLE=[[12,17,19],[255,218,120],[69,146,212],[241,114,182]];
export class GrainRenderer{
  constructor(canvas,{baseline=false}={}){
    this.canvas=canvas;this.baseline=baseline;this.ctx=canvas.getContext('2d',{alpha:false});
    this.buffer=document.createElement('canvas');this.sprite=document.createElement('canvas');this.lastRevision=-1;this.lastPalette=null;this.spriteKey='';this.lastState='';this.presented=null;
    canvas.style.imageRendering=baseline?'pixelated':'auto';this.resize();
  }
  resize(){const r=this.canvas.getBoundingClientRect?this.canvas.getBoundingClientRect():{width:384,height:576},dpr=this.baseline?1:Math.min(2,Math.max(1,window.devicePixelRatio||1));
    const w=this.baseline?384:Math.max(1,Math.round(r.width*dpr)),h=this.baseline?576:Math.max(1,Math.round(r.height*dpr));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;this.presented=null;}
  }
  spriteFor(game,colors,contrast){
    const a=game.active;if(!a)return;
    const b=this.baseline?8:BLOCK,key=JSON.stringify([a.shape,a.color,a.materialSeed,contrast]);if(key===this.spriteKey)return;this.spriteKey=key;
    const w=(Math.max(...a.shape.map(p=>p[0]))+1)*b,h=(Math.max(...a.shape.map(p=>p[1]))+1)*b;
    const scale=this.baseline?1:RASTER_SCALE;this.sprite.width=w*scale;this.sprite.height=h*scale;const ctx=this.sprite.getContext('2d'),im=ctx.createImageData(w*scale,h*scale),words=new Uint32Array(im.data.buffer),packed=grainPalette(contrast);
    for(const [bx,by]of a.shape)for(let y=0;y<b;y++)for(let x=0;x<b;x++){
      const gx=bx*b+x,gy=by*b+y,p=(gy*w+gx)*4,mat=this.baseline?((gx*3+gy*5)%7)*30:game.materialFor(gx,gy,a.materialSeed||game.seed);
      const shade=(this.baseline?0:(mat%15-7)*.65+(y===0?7:0))+(contrast?textureOffset(a.color,gx,gy)*.6:0);
      if(this.baseline){for(let c=0;c<3;c++)im.data[p+c]=colors[a.color][c]+shade;im.data[p+3]=255;}
      else{const lights=y===0?1:0,pattern=contrast&&textureOffset(a.color,gx,gy)>0?1:0,index=((a.color*32+mat%32)*16+lights*2+pattern)*8;writeGrain(words,(gy*2)*(w*2)+gx*2,w*2,packed,index);}
    }
    ctx.putImageData(im,0,0);
  }
  draw(game,{contrast=false,motion=false,ghost=true,profile=null}={}){
    const w=game.width,h=game.height,colors=contrast?ACCESSIBLE:NORMAL,revision=this.baseline?game.tick:game.gridVersion,ready=game.state==='ready',active=game.active,p=this.presented;
    // An opaque board plus the same ghost/sprite produces exactly the same final pixels.
    // Reuse only when every visual input and canvas backing size is unchanged.
    if(!this.baseline&&p&&this.lastRevision===revision&&p.game===game&&p.revision===revision&&p.state===game.state&&p.contrast===contrast&&p.motion===motion&&p.ghost===ghost&&p.clearing===!!game.clearTimer&&p.width===this.canvas.width&&p.height===this.canvas.height&&p.active===!!active&&(!active||(p.x===active.x&&p.y===active.y&&p.shape===active.shape&&p.color===active.color&&p.materialSeed===active.materialSeed))){
      if(profile)profile.rendered(null,true,game.state==='playing');return;
    }
    const phases=profile?{pixelBuild:0,pixelUpload:0,boardComposite:0,ghost:0,spriteBuild:0,spriteComposite:0}:null;let at=phases?performance.now():0;

    const raster=this.baseline?1:RASTER_SCALE,rw=w*raster,rh=h*raster;
    if(this.buffer.width!==rw||this.buffer.height!==rh){this.buffer.width=rw;this.buffer.height=rh;this.pctx=this.buffer.getContext('2d',{alpha:false});this.im=this.pctx.createImageData(rw,rh);this.words=new Uint32Array(this.im.data.buffer,this.im.data.byteOffset,this.im.data.byteLength/4);this.readyGrid=new Uint8Array(w*h);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const wx=x/(w/96),wy=y/(h/144),floor=128-Math.sin(wx/18)*8-Math.cos(wx/10)*4;if(wy>floor)this.readyGrid[y*w+x]=wy>136+Math.sin(wx/9)*3?2:wx<51?1:3;}
      this.lastRevision=-1;
    }
    if(revision!==this.lastRevision||contrast!==this.lastPalette||game.state!==this.lastState||game.clearTimer){
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
      words.fill(packed[0]);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=y*w+x,c=g[i];if(!c)continue;let m=0,lights=0,pattern=0,mask=0;
        if(c){
          const mat=ready?((Math.imul(x+1,73856093)^Math.imul(y+1,19349663))>>>8)&255:game.material[i];m=mat%32;
          const top=y===0||!g[i-w],side=x===0||!g[i-1]||x===w-1||!g[i+1];
          if(top)lights|=1;if(side)lights|=2;
          if(top||side||y===h-1||!g[i+w])mask=cornerMask(g,w,h,x,y,c);
          if(contrast)pattern=textureOffset(c,x,y)>0?1:0;
        }
        if(game.clearTimer&&game.clearMask[i]&&!motion)lights|=4;
        writeGrain(words,y*2*rw+x*2,rw,packed,((c*32+m)*16+lights*2+pattern)*8,mask);
      }
      }
      if(phases){const end=performance.now();phases.pixelBuild=end-at;at=end;}
      this.pctx.putImageData(this.im,0,0);if(phases){const end=performance.now();phases.pixelUpload=end-at;at=end;}this.lastRevision=revision;this.lastPalette=contrast;this.lastState=game.state;
    }
    const ctx=this.ctx,s=this.canvas.width/w;ctx.imageSmoothingEnabled=!this.baseline;ctx.imageSmoothingQuality='high';ctx.drawImage(this.buffer,0,0,this.canvas.width,this.canvas.height);if(phases){const end=performance.now();phases.boardComposite=end-at;at=end;}
    if(game.active){const a=game.active,b=this.baseline?8:BLOCK;
      if(ghost){ctx.strokeStyle=`rgba(${colors[a.color].join(',')},.2)`;ctx.lineWidth=Math.max(1,s*.6);ctx.setLineDash([3*s,3*s]);const gy=game.ghostY();for(const[x,y]of a.shape)ctx.strokeRect((a.x+x*b)*s+s,(gy+y*b)*s+s,(b-2)*s,(b-2)*s);ctx.setLineDash([]);}
      if(phases){const end=performance.now();phases.ghost=end-at;at=end;}
      this.spriteFor(game,colors,contrast);if(phases){const end=performance.now();phases.spriteBuild=end-at;at=end;}
      ctx.drawImage(this.sprite,a.x*s,a.y*s,this.sprite.width*s/raster,this.sprite.height*s/raster);if(phases)phases.spriteComposite=performance.now()-at;
    }
    this.presented={game,revision,state:game.state,contrast,motion,ghost,clearing:!!game.clearTimer,width:this.canvas.width,height:this.canvas.height,active:!!active,x:active?.x,y:active?.y,shape:active?.shape,color:active?.color,materialSeed:active?.materialSeed};
    if(profile)profile.rendered(phases,false,game.state==='playing');
  }
}
