import test from'node:test';import assert from'node:assert/strict';
import{RASTER_SCALE,cornerMask,grainPalette,grainGeometry,grainAppearance,buildAppearances,grainIndex,ANCHOR_MATERIALS}from'../../dist/preview/reference-r3-raster.js';
import{Game}from'../../dist/preview/reference-r3-engine.js';import{GrainRenderer}from'../../dist/preview/reference-r3-renderer.js';
function canvas(){const ctx={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(im){this.image=im;}};return{style:{},width:384,height:576,getBoundingClientRect:()=>({width:384,height:576}),getContext:()=>new Proxy(ctx,{get:(t,k)=>k in t?t[k]:()=>{}}),ctx};}
function draw(g,options={}){globalThis.window={devicePixelRatio:2};globalThis.document={createElement:canvas};const r=new GrainRenderer(canvas());r.draw(g,{ghost:false,...options});return r;}
test('Historical R3: Display sampling increases while physical grains and state stay unchanged',()=>{const g=new Game({width:8,height:8});g.state='paused';g.grid[27]=1;g.material[27]=74;g.added=1;const state=g.snapshot(),grid=g.grid.slice(),r=draw(g);assert.equal(RASTER_SCALE,2);assert.equal(r.buffer.width,16);assert.equal(r.buffer.height,16);assert.deepEqual(g.grid,grid);assert.deepEqual(g.snapshot(),state);});
test('Historical R3: Coverage never paints a physical gap, and same-color diagonal contacts retain their shared corner',()=>{
 const w=7,g=new Uint8Array(w*w);g[3*w+3]=1;assert.equal(cornerMask(g,w,w,3,3,1),15);
 g[2*w+2]=1;assert.equal(cornerMask(g,w,w,3,3,1)&1,0);assert.equal(cornerMask(g,w,w,2,2,1)&8,0);
 g[2*w+2]=2;assert.equal(cornerMask(g,w,w,3,3,1)&1,1);
 const game=new Game({width:w,height:w});game.state='paused';game.grid.set(g);game.material.fill(42);game.added=2;const r=draw(game),bg=[12,17,19,255];
 for(let y=0;y<w;y++)for(let x=0;x<w;x++)if(!g[y*w+x])for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){const p=((y*2+yy)*w*2+x*2+xx)*4;assert.deepEqual([...r.im.data.slice(p,p+4)],bg);}
});
test('Historical R3: Interior grain facets are stable, finite, richer than a flat cell, and keep material-dependent variation',()=>{
 const g=new Game({width:12,height:12});g.state='paused';g.grid.fill(1);g.material.forEach((_,i)=>g.material[i]=1+i%255);g.added=g.size;const r=draw(g),a=r.im.data.slice();r.presented=null;r.lastRevision=-1;r.draw(g,{ghost:false});assert.deepEqual(r.im.data,a);
 const p=(5*2*r.buffer.width+5*2)*4;assert.notEqual(a[p],a[p+4]);assert.notEqual(a[p],a[p+r.buffer.width*4]);assert(new Set(a.filter((_,i)=>i%4===0)).size>20);
 for(let i=3;i<a.length;i+=4)assert.equal(a[i],255);assert.equal(grainPalette(false).length,81920);
});
test('Historical R3: High-contrast palettes preserve three distinct grain patterns and clear feedback is bounded',()=>{
 const signatures=[];for(let c=1;c<=3;c++){const g=new Game({width:12,height:12});g.state='playing';g.grid.fill(c);g.material.fill(100);g.added=g.size;const r=draw(g,{contrast:true});signatures.push([...r.im.data.filter((_,i)=>i%4===0)].join(','));g.clearMask.fill(1);g.clearTimer=12;r.presented=null;r.draw(g,{contrast:true,ghost:false});assert(r.im.data.every(Number.isFinite));}assert.equal(new Set(signatures).size,3);
});

test('Historical R3: Directional contact cues stay local, sparse and distinct from pure random albedo',()=>{
 const w=7,g=new Uint8Array(49),m=new Uint8Array(49);g.fill(1);m.fill(42);g.fill(0,0,w*2);
 assert.equal(grainGeometry(g,w,w,3,2,1,42),1);assert.equal(grainGeometry(g,w,w,3,3,1,42),5);assert.equal(grainGeometry(g,w,w,3,4,1,42),0);
 assert.equal(grainGeometry(g,w,w,3,3,1,43),0);g[3*w+2]=g[3*w+4]=0;assert.notEqual(grainGeometry(g,w,w,3,3,1,42),5);
 const p=grainPalette(false),weak=grainIndex(1,40,0),strong=grainIndex(1,8,0),bytes=new Uint8Array(p.buffer);assert.equal(40&31,8&31);assert(bytes[strong*4]-bytes[(strong+3)*4]>bytes[weak*4]-bytes[(weak+3)*4]);
});

test('Historical R3: Sparse body cues are complete same-color pairs, with no orphan cue or overlapping diagonal streak',()=>{
 const w=7,g=new Uint8Array(49),m=new Uint8Array(49),anchor=ANCHOR_MATERIALS.findIndex(v=>v),plain=ANCHOR_MATERIALS.findIndex((v,i)=>i>0&&!v);g.fill(1);m.fill(plain);m[2*w+2]=anchor;
 assert.equal(ANCHOR_MATERIALS.reduce((a,b)=>a+b,0),16);assert.equal(new Set([...ANCHOR_MATERIALS].flatMap((v,i)=>v?[i&31]:[])).size,16);
 assert.equal(grainGeometry(g,w,w,2,2,1,anchor,m),8);assert.equal(grainGeometry(g,w,w,3,3,1,plain,m),9);assert.equal(grainGeometry(g,w,w,4,4,1,plain,m),0);
 g[2*w+3]=0;assert.notEqual(grainGeometry(g,w,w,2,2,1,anchor,m),8);assert.notEqual(grainGeometry(g,w,w,3,3,1,plain,m),9);
 g.fill(1);m[2*w+3]=anchor;assert.equal(grainGeometry(g,w,w,2,2,1,anchor,m),0);assert.equal(grainGeometry(g,w,w,3,2,1,anchor,m),0);assert.equal(grainGeometry(g,w,w,3,3,1,plain,m),0);
});

test('Historical R3: Cached appearance codes match direct geometry on random fields, edges and changing materials',()=>{
 let seed=18;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 for(let n=0;n<100;n++){const w=3+next()%25,h=3+next()%25,g=new Uint8Array(w*h),m=new Uint8Array(w*h),codes=new Uint8Array(w*h),eligible=new Uint8Array(w*h);
  for(let i=0;i<g.length;i++){g[i]=next()%100<85?1+next()%3:0;m[i]=1+next()%255;}
  for(let round=0;round<3;round++){buildAppearances(g,m,w,h,codes,eligible);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;assert.equal(codes[i],g[i]?grainAppearance(g,w,h,x,y,g[i],m[i],m):0,`scene${n} round${round} at${x},${y}`);}for(let i=0;i<g.length;i+=3){g[i]=next()%4;m[i]=1+next()%255;}}
 }
});
