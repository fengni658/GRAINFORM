import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,SHAPES} from '../../dist/preview/engine.js';
import {GrainRenderer} from '../../dist/preview/renderer.js';
import {buildSurfaceRegion,SURFACE_MATERIALS} from '../../dist/preview/surface-grains.js';
import {grainPalette,grainIndex,grainAppearance,grainTone,writeGrain,cornerMask} from '../../dist/preview/grain-raster.js';
import {textureOffset} from '../../dist/palette.js';

const BACKGROUND=[12,17,19],RAMPS=[null,[[213,172,94],[228,185,104],[236,199,118],[244,208,127]],[[64,170,158],[74,185,172],[84,195,183],[91,205,191]],[[188,100,142],[202,112,155],[214,124,168],[222,134,177]]],ACCESSIBLE=[BACKGROUND,[255,218,120],[69,146,212],[241,114,182]];
function raster(w,h){const data=new Uint8ClampedArray(w*h*16);return {im:{data},words:new Uint32Array(data.buffer)};}
function field(w,h,seed=913){const g={width:w,height:h,grid:new Uint8Array(w*h),material:new Uint8Array(w*h),clearMask:new Uint8Array(w*h)};const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;g.grid[i]=next()%19?1+((x/9+y/11)|0)%3:0;g.material[i]=(i*37+next())&255;g.clearMask[i]=(x+y)%7===0?1:0;}return g;}
function render(g,{contrast=false,clearMask=null}={}){const r=raster(g.width,g.height);buildSurfaceRegion(r,g.grid,g.material,g.width,g.height,contrast,clearMask);return r;}

// Frozen direct-space formulation from the approved offline study. It computes
// distances and lighting from absolute sample positions, without production
// footprints, owner codes, packed pixels, or any dirty-cache helpers.
function directReference(g,{contrast=false,clearMask=null}={}){
 const {width:w,height:h,grid,material}=g,rw=w*2,n=w*h*4,r=raster(w,h),best=new Float32Array(n).fill(Infinity),second=new Float32Array(n).fill(Infinity),owner=new Int32Array(n).fill(-1),packed=grainPalette(contrast),radius=3.4;
 const desc=Array.from({length:256},(_,m)=>{let hash=Math.imul(m+11,2654435761)>>>0;hash^=hash>>>15;const angle=(hash&255)*Math.PI/128;return {anchor:((hash>>>17)&7)===0,jx:(((hash>>>3)&15)-7.5)/35,jy:(((hash>>>12)&15)-7.5)/35,a:Math.cos(angle),b:Math.sin(angle),aspect:.88+((hash>>>8)&31)/100,tone:grainTone(m)};});
 r.words.fill(packed[0]);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,c=grid[i];if(!c)continue;const a=grainAppearance(grid,w,h,x,y,c),pattern=contrast&&textureOffset(c,x,y)>0?1:0;
  writeGrain(r.words,y*2*rw+x*2,rw,packed,grainIndex(c,material[i],a>>>4,pattern,!!clearMask?.[i]),a&15);
  const d=desc[material[i]];if(!d.anchor)continue;const cx=x+.5+d.jx,cy=y+.5+d.jy;
  for(let py=Math.max(0,Math.floor((cy-radius)*2));py<Math.min(h*2,Math.ceil((cy+radius)*2));py++)for(let px=Math.max(0,Math.floor((cx-radius)*2));px<Math.min(rw,Math.ceil((cx+radius)*2));px++){
   if(grid[(py>>1)*w+(px>>1)]!==c)continue;const dx=(px+.5)/2-cx,dy=(py+.5)/2-cy,u=dx*d.a+dy*d.b,v=-dx*d.b+dy*d.a,distance=u*u/d.aspect+v*v*d.aspect;if(distance>radius*radius)continue;
   const p=py*rw+px;if(distance<best[p]){second[p]=best[p];best[p]=distance;owner[p]=i;}else if(distance<second[p])second[p]=distance;
  }
 }
 for(let py=0;py<h*2;py++)for(let px=0;px<rw;px++){
  const p=py*rw+px,j=owner[p],x=px>>1,y=py>>1,i=y*w+x,c=grid[i];if(!c||j<0)continue;
  const d=desc[material[j]],dx=(px+.5)/2-(j%w+.5+d.jx),dy=(py+.5)/2-((j/w|0)+.5+d.jy),direction=(dx+dy)*.7071,pattern=contrast&&textureOffset(c,x,y)>0?1:0;
  let shade=Math.max(-7,Math.min(5,-direction*3.2));if(second[p]-best[p]<1.1&&direction>.25)shade-=7*(1-(second[p]-best[p])/1.1);
  if(contrast)shade+=(c===1?(pattern?3:-57):c===2?(pattern?72:-9):(pattern?7:-69))*.6+[-10,-4,1,7][d.tone];if(clearMask?.[i])shade+=24;
  const color=contrast?ACCESSIBLE[c]:RAMPS[c][d.tone],q=(py&1)*2+(px&1),clipped=cornerMask(grid,w,h,x,y,c)&(1<<q);
  // Uint8ClampedArray supplies the original round-to-nearest-even behavior,
  // including the intermediate rounding before exposed-corner coverage.
  for(let ch=0;ch<3;ch++){r.im.data[p*4+ch]=color[ch]+shade;if(clipped)r.im.data[p*4+ch]=r.im.data[p*4+ch]*.67+BACKGROUND[ch]*.33;}r.im.data[p*4+3]=255;
 }
 return r;
}

function canvas(){const context={uploads:0,calls:0,createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(im){this.uploads++;this.image=im;},drawImage(){this.calls++;},strokeRect(){},setLineDash(){}};return {style:{},width:0,height:0,context,getBoundingClientRect:()=>({width:352,height:528}),getContext:()=>context};}
function setupRenderer(){globalThis.window={devicePixelRatio:2};globalThis.document={createElement:canvas};return new GrainRenderer(canvas());}
function pixel(data,w,x,y,q=0){const p=((y*2+(q>>1))*w*2+x*2+(q&1))*4;return [...data.slice(p,p+4)];}

test('The optimized surface matches the direct approved algorithm, including clipping and channel rounding',()=>{
 for(const [w,h]of[[17,19],[53,43],[67,35]]){
  const g=field(w,h,w*h);for(let i=0;i<Math.min(g.material.length,256);i++)g.material[i]=i;
  for(const contrast of[false,true])for(const clear of[false,true]){const options={contrast,clearMask:clear?g.clearMask:null};assert.deepEqual(render(g,options).im.data,directReference(g,options).im.data,`${w}x${h}, contrast=${contrast}, clear=${clear}`);}
 }
});

test('Carried material sites translate exactly with the occupied field and repeated frames stay identical',()=>{
 const w=53,h=47,a=field(w,h),b=field(w,h);a.grid.fill(0);a.material.fill(0);b.grid.fill(0);b.material.fill(0);const dx=3,dy=2;
 for(let y=8;y<35;y++)for(let x=8;x<39;x++){const i=y*w+x,j=(y+dy)*w+x+dx;a.grid[i]=b.grid[j]=x<24?1:2;a.material[i]=b.material[j]=1+((x*73+y*91+x*y*3)%255);}
 const before=render(a),after=render(b),again=render(a);assert.deepEqual(again.im.data,before.im.data);
 for(let py=0;py<(h-dy)*2;py++)for(let px=0;px<(w-dx)*2;px++)assert.equal(before.words[py*w*2+px],after.words[(py+dy*2)*w*2+px+dx*2]);
});

test('Real empty cells remain exact background, touching colors stay distinct, and same-color diagonal contacts are filled',()=>{
 const g=field(23,21),anchor=SURFACE_MATERIALS.findIndex((d,i)=>i>0&&d.anchor);g.grid.fill(0);g.material.fill(anchor);
 for(let y=7;y<14;y++)for(let x=4;x<19;x++)g.grid[y*g.width+x]=x<9?1:x<14?2:3;
 for(let y=7;y<14;y++)g.grid[y*g.width+11]=0;g.grid[3*g.width+3]=g.grid[4*g.width+4]=1;
 const r=render(g);for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++)for(let q=0;q<4;q++){
  const p=pixel(r.im.data,g.width,x,y,q),c=g.grid[y*g.width+x];if(!c)assert.deepEqual(p,[...BACKGROUND,255]);
  else if(c===1)assert(p[0]>p[1]&&p[1]>p[2]);else if(c===2)assert(p[1]>p[0]&&p[2]>p[0]);else assert(p[0]>p[1]&&p[2]>p[1]);
 }
 assert.equal(cornerMask(g.grid,g.width,g.height,3,3,1)&8,0);assert.equal(cornerMask(g.grid,g.width,g.height,4,4,1)&1,0);
 const filled=pixel(r.im.data,g.width,3,3,3);g.grid[4*g.width+4]=2;const separated=pixel(render(g).im.data,g.width,3,3,3);assert(filled[0]>separated[0]+30,'the same-color contact must not be rounded away');
});

test('Rendering, accessibility, clear feedback and reduced motion do not mutate simulation or RNG state',()=>{
 const g=new Game({width:61,height:55,seed:77}),r=setupRenderer(),f=field(g.width,g.height);g.grid.set(f.grid);g.material.set(f.material);g.clearMask.set(f.clearMask);g.state='playing';g.active=null;g.added=g.count();
 const snapshot=g.snapshot(),arrays=Object.fromEntries(Object.entries(g).filter(([,v])=>ArrayBuffer.isView(v)).map(([k,v])=>[k,v.slice()])),rng=[g.physicsRng.state,g.pieceRng.state];
 r.draw(g,{contrast:true,ghost:false});const normal=r.im.data.slice();for(let i=0;i<3;i++){r.lastRevision=-1;r.presented=null;r.draw(g,{contrast:true,ghost:false});assert.deepEqual(r.im.data,normal);}
 g.clearTimer=12;r.presented=null;r.draw(g,{contrast:true,ghost:false});assert.notDeepEqual(r.im.data,normal);
 r.presented=null;r.draw(g,{contrast:true,motion:true,ghost:false});assert.deepEqual(r.im.data,normal);g.clearTimer=0;
 assert.deepEqual(g.snapshot(),snapshot);for(const[k,v]of Object.entries(arrays))assert.deepEqual(g[k],v,k);assert.deepEqual([g.physicsRng.state,g.pieceRng.state],rng);
});

test('Active sprites preserve transparent holes, move without rebuilding, and keep their material surface on lock',()=>{
 const g=new Game({width:144,height:192,seed:17}),r=setupRenderer();g.state='playing';g.active={shape:SHAPES[2].map(p=>p.slice()),color:1,x:24,y:48,materialSeed:412};
 r.draw(g,{ghost:false});const uploads=r.sprite.context.uploads;g.move(3);r.draw(g,{ghost:false});assert.equal(r.sprite.context.uploads,uploads,'translation does not change local sprite material');
 g.rotate();r.draw(g,{ghost:false});assert(r.sprite.context.uploads>uploads);
 const a={...g.active,shape:g.active.shape.map(p=>p.slice())},sprite=r.sprite.context.image.data.slice(),sw=r.sprite.width,sh=r.sprite.height,occupied=new Uint8Array(sw/2*sh/2);
 for(const[bx,by]of a.shape)for(let y=0;y<24;y++)for(let x=0;x<24;x++)occupied[(by*24+y)*(sw/2)+bx*24+x]=1;
 for(let y=0;y<sh/2;y++)for(let x=0;x<sw/2;x++)if(!occupied[y*(sw/2)+x])for(let q=0;q<4;q++)assert.equal(pixel(sprite,sw/2,x,y,q)[3],0);
 g.lock();r.draw(g,{ghost:false});for(let y=0;y<sh/2;y++)for(let x=0;x<sw/2;x++)if(occupied[y*(sw/2)+x])for(let q=0;q<4;q++)assert.deepEqual(pixel(r.im.data,g.width,a.x+x,a.y+y,q),pixel(sprite,sw/2,x,y,q));
});
