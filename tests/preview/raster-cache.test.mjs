import test from'node:test';import assert from'node:assert/strict';
import{Game}from'../../dist/preview/engine.js';import{GrainRenderer}from'../../dist/preview/renderer.js';
import{GrainRenderer as Reference}from'../fixtures/fine-v04-r2-renderer.mjs';
import{grainAppearance}from'../../dist/preview/grain-raster.js';
function canvas(){const ctx={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},drawImage(){},strokeRect(){},setLineDash(){}};return{style:{},width:0,height:0,getBoundingClientRect:()=>({width:352,height:528}),getContext:()=>ctx};}
function setup(w,h){globalThis.window={devicePixelRatio:2};globalThis.document={createElement:canvas};const g=new Game({width:w,height:h,seed:71});g.state='playing';g.active=null;const cached=new GrainRenderer(canvas()),full=new Reference(canvas());return{g,cached,full};}
function compare(s,options={}){s.full.lastRevision=-1;s.full.presented=null;s.cached.presented=null;s.full.draw(s.g,{ghost:false,...options});s.cached.draw(s.g,{ghost:false,...options});assert.deepEqual(s.cached.im.data,s.full.im.data);}
test('Local redraw matches full material rebuild across edges, tail bytes, gaps, materials and lifecycle transitions',()=>{
 let seed=31;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 for(const[w,h]of[[5,7],[31,33],[61,35],[288,432]]){const s=setup(w,h),g=s.g;for(let i=0;i<g.size;i++){g.grid[i]=next()%100<85?1+next()%3:0;g.material[i]=1+next()%255;}compare(s);
  for(let t=0;t<24;t++){for(let n=0;n<1+t%7;n++){const i=n===0?g.size-1:next()%g.size;g.grid[i]=next()%4;g.material[i]=1+next()%255;}g.gridVersion++;compare(s);}
  g.clearTimer=12;g.clearMask.fill(1);g.gridVersion++;compare(s);g.clearMask[g.size-1]=0;g.gridVersion++;compare(s);compare(s,{motion:true});compare(s,{contrast:true});g.clearTimer=0;g.gridVersion++;compare(s,{contrast:true});
  g.state='paused';compare(s);g.state='ready';compare(s);g.state='playing';compare(s);
  for(const key of['grid','material','clearMask']){const b=new Uint8Array(g.size+1);b.set(g[key],1);g[key]=b.subarray(1);}g.grid[g.size-1]=2;g.gridVersion++;compare(s);
  s.cached.words=new Uint32Array(s.cached.im.data.buffer);s.cached.lastRevision=-1;compare(s);
 }
});
test('The four-cell shading dependency stays inside the cache tile halo',()=>{
 let seed=930241;const next=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0,w=17,h=19,g=new Uint8Array(w*h),m=new Uint8Array(w*h);
 const all=()=>Uint8Array.from(g,(c,i)=>c?grainAppearance(g,w,h,i%w,(i/w)|0,c,m[i],m):0);
 for(let n=0;n<50;n++){for(let i=0;i<g.length;i++){g[i]=next()%100<93?1+next()%3:0;m[i]=1+next()%255;}const before=all(),i=next()%g.length,x=i%w,y=(i/w)|0;g[i]=(g[i]+1)%4;m[i]=1+next()%255;const after=all();for(let j=0;j<g.length;j++)if(before[j]!==after[j]){assert(Math.abs(j%w-x)<=4);assert(Math.abs(((j/w)|0)-y)<=4);}}
});

test('Replacing a Game with the same dimensions and revision paints the new board',()=>{
 const s=setup(12,12),first=s.g;first.grid[27]=1;first.material[27]=52;first.gridVersion=7;s.cached.draw(first,{ghost:false});const before=s.cached.im.data.slice();
 const next=new Game({width:12,height:12});next.state=first.state;next.active=null;next.grid[88]=3;next.material[88]=101;next.gridVersion=7;
 const expected=new GrainRenderer(canvas());expected.draw(next,{ghost:false});s.cached.draw(next,{ghost:false});assert.notDeepEqual(s.cached.im.data,before);assert.deepEqual(s.cached.im.data,expected.im.data);
});
