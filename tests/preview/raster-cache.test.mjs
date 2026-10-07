import test from'node:test';import assert from'node:assert/strict';
import{Game}from'../../dist/preview/engine.js';import{GrainRenderer}from'../../dist/preview/renderer.js';
import{buildSurfaceRegion,SURFACE_HALO,SURFACE_MATERIALS}from'../../dist/preview/surface-grains.js';
// Force a fresh full surface build. Reusing the old fine-grain renderer would
// compare two different appearances instead of validating the dirty cache.
class Reference extends GrainRenderer{draw(game,options){this.dirtyState=null;this.lastRevision=-1;this.presented=null;return super.draw(game,options);}}
function canvas(){const ctx={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},drawImage(){},strokeRect(){},setLineDash(){}};return{style:{},width:0,height:0,getBoundingClientRect:()=>({width:352,height:528}),getContext:()=>ctx};}
function setup(w,h){globalThis.window={devicePixelRatio:2};globalThis.document={createElement:canvas};const g=new Game({width:w,height:h,seed:71});g.state='playing';g.active=null;const cached=new GrainRenderer(canvas()),full=new Reference(canvas());return{g,cached,full};}
function compare(s,options={}){s.cached.presented=null;s.full.draw(s.g,{ghost:false,...options});s.cached.draw(s.g,{ghost:false,...options});assert.deepEqual(s.cached.im.data,s.full.im.data);if(s.g.state!=='ready')assert.equal(s.full.dirtyState.full,true);}
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
test('A single source change affects no output beyond the four-cell surface halo',()=>{
 const w=19,h=19,g=new Uint8Array(w*h).fill(1),m=new Uint8Array(w*h),plain=SURFACE_MATERIALS.findIndex(d=>!d.anchor),anchors=SURFACE_MATERIALS.flatMap((d,i)=>d.anchor?[i]:[]),cx=9,cy=9,source=cy*w+cx;
 m.fill(plain);assert.equal(SURFACE_HALO,4);
 const render=()=>{const data=new Uint8ClampedArray(w*h*16),r={im:{data},words:new Uint32Array(data.buffer)};buildSurfaceRegion(r,g,m,w,h);return r.words;};
 const before=render();let changedAwayFromSource=0;
 for(const anchor of anchors){m[source]=anchor;const after=render();for(let j=0;j<after.length;j++)if(after[j]!==before[j]){const x=(j%(w*2))>>1,y=((j/(w*2))|0)>>1;assert(Math.abs(x-cx)<=4);assert(Math.abs(y-cy)<=4);if(Math.abs(x-cx)>1||Math.abs(y-cy)>1)changedAwayFromSource++;}m[source]=plain;}
 assert(changedAwayFromSource>0,'the test must exercise larger-grain ownership, not only cell-corner geometry');
});

test('Anchor insertion, removal and replacement across tile corners match full rebuilds on the local path',()=>{
 const s=setup(79,61),g=s.g,anchors=SURFACE_MATERIALS.flatMap((d,i)=>d.anchor?[i]:[]),plain=SURFACE_MATERIALS.findIndex(d=>!d.anchor);g.grid.fill(1);g.material.fill(plain);compare(s);let local=0;
 for(const[x,y]of[[7,7],[8,8],[15,16],[16,15],[39,31],[40,32],[77,59]])for(const material of[anchors[0],anchors[1],plain]){const i=y*g.width+x;g.material[i]=material;g.gridVersion++;compare(s);if(!s.cached.dirtyState.full&&s.cached.dirtyState.changed)local++;}
 assert(local>=18,'these cases must exercise the dirty-region halo rather than full-build fallback');
});

test('Replacing a Game with the same dimensions and revision paints the new board',()=>{
 const s=setup(12,12),first=s.g;first.grid[27]=1;first.material[27]=52;first.gridVersion=7;s.cached.draw(first,{ghost:false});const before=s.cached.im.data.slice();
 const next=new Game({width:12,height:12});next.state=first.state;next.active=null;next.grid[88]=3;next.material[88]=101;next.gridVersion=7;
 const expected=new GrainRenderer(canvas());expected.draw(next,{ghost:false});s.cached.draw(next,{ghost:false});assert.notDeepEqual(s.cached.im.data,before);assert.deepEqual(s.cached.im.data,expected.im.data);
});
