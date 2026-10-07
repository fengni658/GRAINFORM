import test from'node:test';import assert from'node:assert/strict';
import{RASTER_SCALE,cornerMask,grainPalette}from'../../dist/preview/grain-raster.js';
import{Game}from'../../dist/preview/engine.js';import{GrainRenderer}from'../../dist/preview/renderer.js';
function canvas(){const ctx={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(im){this.image=im;}};return{style:{},width:384,height:576,getBoundingClientRect:()=>({width:384,height:576}),getContext:()=>new Proxy(ctx,{get:(t,k)=>k in t?t[k]:()=>{}}),ctx};}
function draw(g,options={}){globalThis.window={devicePixelRatio:2};globalThis.document={createElement:canvas};const r=new GrainRenderer(canvas());r.draw(g,{ghost:false,...options});return r;}
test('Display sampling increases while physical grains and state stay unchanged',()=>{const g=new Game({width:8,height:8});g.state='paused';g.grid[27]=1;g.material[27]=74;g.added=1;const state=g.snapshot(),grid=g.grid.slice(),r=draw(g);assert.equal(RASTER_SCALE,2);assert.equal(r.buffer.width,16);assert.equal(r.buffer.height,16);assert.deepEqual(g.grid,grid);assert.deepEqual(g.snapshot(),state);});
test('Coverage never paints a physical gap, and same-color diagonal contacts retain their shared corner',()=>{
 const w=7,g=new Uint8Array(w*w);g[3*w+3]=1;assert.equal(cornerMask(g,w,w,3,3,1),15);
 g[2*w+2]=1;assert.equal(cornerMask(g,w,w,3,3,1)&1,0);assert.equal(cornerMask(g,w,w,2,2,1)&8,0);
 g[2*w+2]=2;assert.equal(cornerMask(g,w,w,3,3,1)&1,1);
 const game=new Game({width:w,height:w});game.state='paused';game.grid.set(g);game.material.fill(42);game.added=2;const r=draw(game),bg=[12,17,19,255];
 for(let y=0;y<w;y++)for(let x=0;x<w;x++)if(!g[y*w+x])for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){const p=((y*2+yy)*w*2+x*2+xx)*4;assert.deepEqual([...r.im.data.slice(p,p+4)],bg);}
});
test('Interior grain facets are stable, finite, richer than a flat cell, and keep material-dependent variation',()=>{
 const g=new Game({width:12,height:12});g.state='paused';g.grid.fill(1);g.material.forEach((_,i)=>g.material[i]=1+i%255);g.added=g.size;const r=draw(g),a=r.im.data.slice();r.presented=null;r.lastRevision=-1;r.draw(g,{ghost:false});assert.deepEqual(r.im.data,a);
 const p=(5*2*r.buffer.width+5*2)*4;assert.notEqual(a[p],a[p+4]);assert.notEqual(a[p],a[p+r.buffer.width*4]);assert(new Set(a.filter((_,i)=>i%4===0)).size>20);
 for(let i=3;i<a.length;i+=4)assert.equal(a[i],255);assert.equal(grainPalette(false).length,16384);
});
test('High-contrast palettes preserve three distinct grain patterns and clear feedback is bounded',()=>{
 const signatures=[];for(let c=1;c<=3;c++){const g=new Game({width:12,height:12});g.state='playing';g.grid.fill(c);g.material.fill(100);g.added=g.size;const r=draw(g,{contrast:true});signatures.push([...r.im.data.filter((_,i)=>i%4===0)].join(','));g.clearMask.fill(1);g.clearTimer=12;r.presented=null;r.draw(g,{contrast:true,ghost:false});assert(r.im.data.every(Number.isFinite));}assert.equal(new Set(signatures).size,3);
});
