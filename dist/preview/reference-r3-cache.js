// Renderer-owned snapshots; simulation state and revision semantics are unchanged.
// Current shader affected-output radius is at most 4 cells. Recheck the halo if it changes.
import {grainPalette,grainAppearance,buildAppearances,grainIndex,writeGrain} from './reference-r3-raster.js';
import {textureOffset} from '../palette.js';

export function dirtyBuild(r,game,contrast,motion,tileSize=8,threshold=.25,scan32=true){
 const w=game.width,h=game.height,n=w*h,g=game.grid,m=game.material,clear=!!game.clearTimer&&!motion,rw=w*2,packed=grainPalette(contrast),words=r.words;
 let s=r.dirtyState,full=!s||s.game!==game||s.w!==w||s.h!==h||s.words!==words;
 if(full){const cols=Math.ceil(w/tileSize),rows=Math.ceil(h/tileSize);s=r.dirtyState={game,w,h,words,cols,rows,grid:new Uint8Array(n),material:new Uint8Array(n),clearMask:new Uint8Array(n),source:new Uint8Array(cols*rows),dirty:new Uint8Array(cols*rows),changed:0,dirtyCount:0,full:false};}
 full=full||s.contrast!==contrast||s.clear!==clear;
 s.source.fill(0);s.dirty.fill(0);let changes=0;
 // The scan owns its snapshots; no simulation dirty flags or arrays are changed.
 if(!full&&scan32&&g.byteOffset%4===0&&m.byteOffset%4===0&&game.clearMask.byteOffset%4===0){
  if(s.gridRef!==g||s.materialRef!==m||s.maskRef!==game.clearMask){s.gridRef=g;s.materialRef=m;s.maskRef=game.clearMask;s.g32=new Uint32Array(g.buffer,g.byteOffset,n>>>2);s.m32=new Uint32Array(m.buffer,m.byteOffset,n>>>2);s.c32=new Uint32Array(game.clearMask.buffer,game.clearMask.byteOffset,n>>>2);s.oldG32=new Uint32Array(s.grid.buffer,0,n>>>2);s.oldM32=new Uint32Array(s.material.buffer,0,n>>>2);s.oldC32=new Uint32Array(s.clearMask.buffer,0,n>>>2);}
  let sourceCount=0;
  const mark=i=>{const c=g[i];if(c!==s.grid[i]||(c&&m[i]!==s.material[i])||(clear&&game.clearMask[i]!==s.clearMask[i])){const y=(i/w)|0,x=i-y*w,t=((y/tileSize)|0)*s.cols+((x/tileSize)|0);if(!s.source[t]){s.source[t]=1;sourceCount++;}changes++;}};
  for(let q=0;q<s.g32.length;q++)if(s.g32[q]!==s.oldG32[q]||(s.g32[q]&&s.m32[q]!==s.oldM32[q])||(clear&&s.c32[q]!==s.oldC32[q])){
   const i=q*4;mark(i);mark(i+1);mark(i+2);mark(i+3);
   if(sourceCount>threshold*s.source.length){full=true;break;}
  }
  if(!full)for(let i=(n>>>2)*4;i<n;i++)mark(i);
 }else if(!full){
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=y*w+x,c=g[i];
   if(c!==s.grid[i]||(c&&m[i]!==s.material[i])||(clear&&game.clearMask[i]!==s.clearMask[i])){
    s.source[Math.floor(y/tileSize)*s.cols+Math.floor(x/tileSize)]=1;changes++;
   }
  }
 }
 s.grid.set(g);s.material.set(m);if(clear)s.clearMask.set(game.clearMask);
 s.contrast=contrast;s.clear=clear;s.changed=changes;
 let dirtyCount=0;
 if(!full&&changes){
  // A one-tile halo at sizes >= 4 contains the complete x +-3, y -3..+4
  // affected-output rectangle of every changed source cell.
  for(let ty=0;ty<s.rows;ty++)for(let tx=0;tx<s.cols;tx++)if(s.source[ty*s.cols+tx]){
   for(let dy=Math.max(0,ty-1);dy<=Math.min(s.rows-1,ty+1);dy++)for(let dx=Math.max(0,tx-1);dx<=Math.min(s.cols-1,tx+1);dx++){
    const t=dy*s.cols+dx;if(!s.dirty[t]){s.dirty[t]=1;dirtyCount++;}
   }
  }
  if(dirtyCount>threshold*s.dirty.length)full=true;
 }
 s.dirtyCount=dirtyCount;s.full=full;
 if(full){
  buildAppearances(g,m,w,h,r.appearanceCodes,r.pairEligibility);words.fill(packed[0]);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=y*w+x,c=g[i];if(!c)continue;
   const a=r.appearanceCodes[i],pattern=contrast&&textureOffset(c,x,y)>0?1:0;
   writeGrain(words,y*2*rw+x*2,rw,packed,grainIndex(c,m[i],a>>>4,pattern,clear&&game.clearMask[i]),a&15);
  }
 }else if(changes){
  for(let ty=0;ty<s.rows;ty++)for(let tx=0;tx<s.cols;tx++)if(s.dirty[ty*s.cols+tx]){
   for(let y=ty*tileSize;y<Math.min(h,(ty+1)*tileSize);y++)for(let x=tx*tileSize;x<Math.min(w,(tx+1)*tileSize);x++){
    const i=y*w+x,c=g[i],p=y*2*rw+x*2;
    if(!c){words[p]=words[p+1]=words[p+rw]=words[p+rw+1]=packed[0];continue;}
    const a=grainAppearance(g,w,h,x,y,c,m[i],m),pattern=contrast&&textureOffset(c,x,y)>0?1:0;
    writeGrain(words,p,rw,packed,grainIndex(c,m[i],a>>>4,pattern,clear&&game.clearMask[i]),a&15);
   }
  }
 }
}
