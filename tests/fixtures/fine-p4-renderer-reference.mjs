import{BLOCK,WIDTH,HEIGHT}from'../../dist/preview/engine.js';
import{textureOffset}from'../../dist/palette.js';
const NORMAL=[[12,17,19],[234,195,112],[79,192,179],[211,120,163]];
const ACCESSIBLE=[[12,17,19],[255,218,120],[69,146,212],[241,114,182]];
export class GrainRenderer{
  constructor(canvas,{baseline=false}={}){
    this.canvas=canvas;this.baseline=baseline;this.ctx=canvas.getContext('2d',{alpha:false});
    this.buffer=document.createElement('canvas');this.sprite=document.createElement('canvas');this.lastRevision=-1;this.lastPalette=null;this.spriteKey='';this.lastState='';
    canvas.style.imageRendering=baseline?'pixelated':'auto';this.resize();
  }
  resize(){const r=this.canvas.getBoundingClientRect?this.canvas.getBoundingClientRect():{width:384,height:576},dpr=this.baseline?1:Math.min(2,Math.max(1,window.devicePixelRatio||1));
    const w=this.baseline?384:Math.max(1,Math.round(r.width*dpr)),h=this.baseline?576:Math.max(1,Math.round(r.height*dpr));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
  }
  spriteFor(game,colors,contrast){
    const a=game.active;if(!a)return;
    const b=this.baseline?8:BLOCK,key=JSON.stringify([a.shape,a.color,a.materialSeed,contrast]);if(key===this.spriteKey)return;this.spriteKey=key;
    const w=(Math.max(...a.shape.map(p=>p[0]))+1)*b,h=(Math.max(...a.shape.map(p=>p[1]))+1)*b;
    this.sprite.width=w;this.sprite.height=h;const ctx=this.sprite.getContext('2d'),im=ctx.createImageData(w,h);
    for(const [bx,by]of a.shape)for(let y=0;y<b;y++)for(let x=0;x<b;x++){
      const gx=bx*b+x,gy=by*b+y,p=(gy*w+gx)*4,mat=this.baseline?((gx*3+gy*5)%7)*30:game.materialFor(gx,gy,a.materialSeed||game.seed);
      const shade=(this.baseline?0:(mat%15-7)*.65+(y===0?7:0))+(contrast?textureOffset(a.color,gx,gy)*.6:0);
      for(let c=0;c<3;c++)im.data[p+c]=colors[a.color][c]+shade;im.data[p+3]=255;
    }
    ctx.putImageData(im,0,0);
  }
  draw(game,{contrast=false,motion=false,ghost=true}={}){
    const w=game.width,h=game.height,colors=contrast?ACCESSIBLE:NORMAL;
    if(this.buffer.width!==w||this.buffer.height!==h){this.buffer.width=w;this.buffer.height=h;this.pctx=this.buffer.getContext('2d',{alpha:false});this.im=this.pctx.createImageData(w,h);this.lastRevision=-1;}
    const revision=this.baseline?game.tick:game.gridVersion,ready=game.state==='ready';
    if(revision!==this.lastRevision||contrast!==this.lastPalette||game.state!==this.lastState||game.clearTimer){
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
      this.pctx.putImageData(this.im,0,0);this.lastRevision=revision;this.lastPalette=contrast;this.lastState=game.state;
    }
    const ctx=this.ctx,s=this.canvas.width/w;ctx.imageSmoothingEnabled=!this.baseline;ctx.imageSmoothingQuality='high';ctx.drawImage(this.buffer,0,0,this.canvas.width,this.canvas.height);
    if(game.active){const a=game.active,b=this.baseline?8:BLOCK;
      if(ghost){ctx.strokeStyle=`rgba(${colors[a.color].join(',')},.2)`;ctx.lineWidth=Math.max(1,s*.6);ctx.setLineDash([3*s,3*s]);const gy=game.ghostY();for(const[x,y]of a.shape)ctx.strokeRect((a.x+x*b)*s+s,(gy+y*b)*s+s,(b-2)*s,(b-2)*s);ctx.setLineDash([]);}
      this.spriteFor(game,colors,contrast);ctx.drawImage(this.sprite,a.x*s,a.y*s,this.sprite.width*s,this.sprite.height*s);
    }
  }
}
