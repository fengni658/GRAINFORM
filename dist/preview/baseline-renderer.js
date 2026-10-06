// Rendering functions extracted from frozen a2005e9 dist/app.js.
// Only dependency plumbing and optional ghost visibility differ; both A/B sides hide ghosts.
import {WIDTH,HEIGHT,BLOCK} from './baseline-engine.js';
import {STANDARD_COLORS,ACCESSIBLE_COLORS,textureOffset} from '../palette.js';
export class BaselineRenderer {
constructor(canvas){
canvas.width=384;canvas.height=576;canvas.style.imageRendering='pixelated';
const ctx=canvas.getContext('2d',{alpha:false}),pixelCanvas=document.createElement('canvas');pixelCanvas.width=WIDTH;pixelCanvas.height=HEIGHT;
const px=pixelCanvas.getContext('2d',{alpha:false}),pixels=px.createImageData(WIDTH,HEIGHT),data=pixels.data;
let prefs={contrast:false,motion:false},colors=STANDARD_COLORS,shades;
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
function draw(game,{contrast=false,motion=false,ghost:showGhost=true}={}){
  prefs={contrast,motion};colors=contrast?ACCESSIBLE_COLORS:STANDARD_COLORS;shades=colors.map(c=>Array.from({length:7},(_,n)=>c.map(v=>Math.max(0,Math.min(255,v+(n-3)*4)))));
  const g=game.grid,ready=game.state==='ready';
  for(let i=0;i<g.length;i++){
    let c=g[i];const x=i%WIDTH,y=(i/WIDTH)|0;
    if(ready){const floor=HEIGHT-16-Math.sin(x/18)*8-Math.cos(x/10)*4;if(y>floor)c=y>HEIGHT-8+Math.sin(x/9)*3?2:x<51?1:3;}
    const rgb=c?shades[c][((i*17+(i/96|0)*13)%7)]:colors[0],p=i*4;
    const texture=prefs.contrast&&c?textureOffset(c,x,y):0;
    data[p]=Math.max(0,Math.min(255,rgb[0]+texture));data[p+1]=Math.max(0,Math.min(255,rgb[1]+texture));data[p+2]=Math.max(0,Math.min(255,rgb[2]+texture));data[p+3]=255;
    if(game.clearTimer&&game.clearMask[i]&&!prefs.motion){data[p]=Math.min(255,rgb[0]+35);data[p+1]=Math.min(255,rgb[1]+35);data[p+2]=Math.min(255,rgb[2]+35);}
  }
  px.putImageData(pixels,0,0);ctx.imageSmoothingEnabled=false;ctx.drawImage(pixelCanvas,0,0,canvas.width,canvas.height);
  const s=canvas.width/WIDTH;
  // Faint reference grid is drawn under the falling piece and does not obscure grains.
  ctx.strokeStyle='#c5ead807';ctx.lineWidth=1;
  for(let x=BLOCK;x<WIDTH;x+=BLOCK){ctx.beginPath();ctx.moveTo(x*s+.5,0);ctx.lineTo(x*s+.5,canvas.height);ctx.stroke();}
  if(game.active){
    const a=game.active;if(showGhost){const ghost=game.ghostY();ctx.setLineDash([3,4]);ctx.strokeStyle=cssColor(a.color,.26);ctx.lineWidth=1;
    for(const [x,y]of a.shape)ctx.strokeRect((a.x+x*BLOCK)*s+2,(ghost+y*BLOCK)*s+2,BLOCK*s-4,BLOCK*s-4);ctx.setLineDash([]);}
    for(const [bx,by]of a.shape){
      const x=(a.x+bx*BLOCK)*s,y=(a.y+by*BLOCK)*s;
      ctx.fillStyle=cssColor(a.color);ctx.fillRect(x,y,BLOCK*s,BLOCK*s);drawPattern(ctx,a.color,x,y,BLOCK*s);ctx.fillStyle='#ffffff20';ctx.fillRect(x,y,BLOCK*s,2);ctx.fillStyle='#00000017';ctx.fillRect(x,y+BLOCK*s-2,BLOCK*s,2);
      for(let gy=0;gy<BLOCK;gy++)for(let gx=0;gx<BLOCK;gx++)if((gx*3+gy*5)%7===0){ctx.fillStyle='#ffffff15';ctx.fillRect(x+gx*s,y+gy*s,s,s);}
    }
  }
  if(game.state==='playing'){
    // Spawn boundary indication becomes visible only when the pile is close to the top.
    let danger=false;for(let i=0;i<WIDTH*24;i++)if(g[i]){danger=true;break;}
    if(danger){ctx.strokeStyle='#d7789088';ctx.setLineDash([5,7]);ctx.beginPath();ctx.moveTo(0,24*s);ctx.lineTo(canvas.width,24*s);ctx.stroke();ctx.setLineDash([]);}
  }
}

this.draw=draw;this.resize=()=>{};
}
}
