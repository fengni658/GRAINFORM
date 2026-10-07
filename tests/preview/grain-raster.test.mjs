import test from'node:test';import assert from'node:assert/strict';
import{RASTER_SCALE,cornerMask,grainPalette,grainAppearance,grainIndex,grainTone,buildAppearances}from'../../dist/preview/grain-raster.js';
import{Game}from'../../dist/preview/engine.js';import{GrainRenderer}from'../../dist/preview/renderer.js';
function canvas(){const ctx={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){}};return{style:{},width:384,height:576,getBoundingClientRect:()=>({width:384,height:576}),getContext:()=>new Proxy(ctx,{get:(t,k)=>k in t?t[k]:()=>{}})};}
function draw(g,options={}){globalThis.window={devicePixelRatio:2};globalThis.document={createElement:canvas};const r=new GrainRenderer(canvas());r.draw(g,{ghost:false,...options});return r;}
const sample=(r,x,y)=>[...r.im.data.slice((y*r.buffer.width+x)*4,(y*r.buffer.width+x)*4+4)];
test('Whole-grain tone distribution is fixed and every interior grain keeps one average color',()=>{
 const counts=[0,0,0,0];for(let m=0;m<256;m++)counts[grainTone(m)]++;assert.deepEqual(counts,[26,76,102,52]);assert.equal(RASTER_SCALE,2);
 for(const contrast of[false,true])for(let c=1;c<=3;c++)for(let m=0;m<256;m++){const p=grainPalette(contrast),i=grainIndex(c,m,0);assert.equal(p[i],p[i+1]);assert.equal(p[i],p[i+2]);assert.equal(p[i],p[i+3]);}
});
test('Ordinary matte grains avoid clipped white highlights and color interfaces add no artificial gap shading',()=>{
 const palette=grainPalette(false),bytes=new Uint8Array(palette.buffer);for(let c=1;c<=3;c++)for(let m=0;m<256;m++)for(let geometry=0;geometry<16;geometry++){const i=grainIndex(c,m,geometry)*4;for(let q=0;q<4;q++)for(let ch=0;ch<3;ch++)assert(bytes[i+q*4+ch]<255);}
 const g=new Uint8Array(49).fill(2);g[24]=1;assert.equal(grainAppearance(g,7,7,3,3,1),0);
});
test('Every raw sample of an actual gap stays background while diagonal same-color quarter contacts stay filled',()=>{
 const g=new Game({width:9,height:9});g.state='paused';g.grid[30]=g.grid[40]=1;g.grid[32]=2;g.material.fill(52);g.added=3;
 assert.equal(cornerMask(g.grid,9,9,3,3,1)&8,0);assert.equal(cornerMask(g.grid,9,9,4,4,1)&1,0);
 const r=draw(g),bg=[12,17,19,255];for(let y=0;y<9;y++)for(let x=0;x<9;x++)if(!g.grid[y*9+x])for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++)assert.deepEqual(sample(r,x*2+xx,y*2+yy),bg);
 const a=grainAppearance(g.grid,9,9,3,3,1),p=grainPalette(false),i=grainIndex(1,52,a>>>4);assert.equal(r.words[(3*2+1)*18+3*2+1],p[i+3]);
 g.grid[40]=2;assert.notEqual(cornerMask(g.grid,9,9,3,3,1)&8,0);
});
test('Tone follows stable material and static redraws cannot crawl or change game state',()=>{
 const g=new Game({width:12,height:12});g.state='playing';g.grid.fill(1);g.material.forEach((_,i)=>g.material[i]=1+i%255);g.added=g.size;const state=g.snapshot(),physics=g.physicsRng.state,pieces=g.pieceRng.state,r=draw(g),first=r.im.data.slice();
 for(let t=0;t<6;t++){r.lastRevision=-1;r.presented=null;r.draw(g,{ghost:false});assert.deepEqual(r.im.data,first);}assert.deepEqual(g.snapshot(),state);assert.equal(g.physicsRng.state,physics);assert.equal(g.pieceRng.state,pieces);
 const from=4*12+4,to=7*12+7,old=sample(r,8,8);[g.material[from],g.material[to]]=[g.material[to],g.material[from]];g.gridVersion++;r.draw(g,{ghost:false});assert.deepEqual(sample(r,14,14),old);
});
test('All accessibility color patterns remain distinct and clear/reduced-motion rendering is explicit',()=>{
 const signatures=[];for(let c=1;c<=3;c++){const g=new Game({width:12,height:12});g.state='playing';g.grid.fill(c);g.material.fill(100);g.added=g.size;const r=draw(g,{contrast:true}),normal=r.im.data.slice();signatures.push([...normal].join(','));g.clearMask.fill(1);g.clearTimer=12;r.presented=null;r.draw(g,{ghost:false,contrast:true});assert.notDeepEqual(r.im.data,normal);r.presented=null;r.draw(g,{ghost:false,contrast:true,motion:true});assert.deepEqual(r.im.data,normal);}assert.equal(new Set(signatures).size,3);
});
test('Full appearance rebuild and direct local query agree on edges and mixed-color fields',()=>{
 let seed=18;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;for(let n=0;n<100;n++){const w=3+next()%25,h=3+next()%25,g=new Uint8Array(w*h),m=new Uint8Array(w*h),codes=new Uint8Array(w*h);for(let i=0;i<g.length;i++){g[i]=next()%4;m[i]=1+next()%255;}buildAppearances(g,m,w,h,codes);for(let i=0;i<g.length;i++)assert.equal(codes[i],g[i]?grainAppearance(g,w,h,i%w,(i/w)|0,g[i]):0);}
});
