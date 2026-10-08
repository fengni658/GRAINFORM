import test from 'node:test';
import assert from 'node:assert/strict';
import { GridBodyStore, GridLayerRenderer, clearHighlightBodies, staleEpoch } from '../app.mjs';
import { readFile } from 'node:fs/promises';
class Context{
 constructor(){this.polygons=0;this.clears=[];this.images=0;this.paths=[];this.path=null;this.fills=[];}
 setTransform(...v){this.transform=v;}clearRect(...v){this.clears.push(v);}save(){}restore(){}rect(){}clip(){}beginPath(){this.path=null;}moveTo(x,y){this.path=[[x,y]];}lineTo(x,y){this.path.push([x,y]);}closePath(){this.polygons++;this.paths.push(this.path);}fill(){this.fills.push(this.fillStyle);}drawImage(){this.images++;}
}
const b=(id,x=30,y=400,sleep=true,color=1)=>({id,x,y,sleep,color,row:0,col:0,radius:.87});
const patch=(upsert=[],removed=[],reset=false,revision=0,previousRevision=0)=>({upsert,removed,reset,revision,previousRevision:reset?null:previousRevision});
const packet=(seq,p,{epoch=1,count=p.upsert.length,mode=p.reset?'full':'delta'}={})=>({type:'snapshot',epoch,seq,baseSeq:p.reset?null:seq-1,mode,snapshot:{bodyCount:count,clearIds:[]},bodyPatch:p});
test('initial full/ordered deltas retain exact ids; sequence gap never partially applies',()=>{
 const requests=[],changes=[],store=new GridBodyStore({onResync:r=>requests.push(r),onChange:p=>changes.push(p)});assert.equal(store.accept(packet(1,patch([b(0),b(1,32)],[],true,2))).accepted,true);
 assert.equal(store.accept(packet(2,patch([b(0,31,400,false)],[],false,3,2),{count:2})).accepted,true);
 const before=store.array();const gap=packet(4,patch([], [1],false,4,3),{count:1});assert.equal(store.accept(gap).resync,true);assert.deepEqual(store.array(),before);assert.equal(requests.length,1);assert.equal(store.accept({...gap,seq:5,baseSeq:4}).resync,true);assert.equal(requests.length,1);
 assert.equal(store.accept(packet(6,patch([b(0,33)],[],true,8))).accepted,true);assert.equal(store.bodies.size,1);assert.equal(store.bodies.get(0).x,33);assert.equal(store.awaitingFull,false);assert.equal(store.seq,6);
});
test('revision/count corruption requests authoritative full sync without ghosts',()=>{
 const store=new GridBodyStore();store.accept(packet(1,patch([b(0)],[],true,2)));assert.equal(store.accept(packet(2,patch([b(1)],[],false,3,99),{count:2})).accepted,false);assert.equal(store.bodies.size,1);
 store.accept(packet(3,patch([b(0)],[],true,3)));assert.equal(store.accept(packet(4,patch([b(2)],[],false,4,3),{count:99})).accepted,false);assert.equal(store.bodies.has(2),false);
 assert.equal(store.accept(packet(1,patch([b(0,100)],[],true,0),{epoch:2})).accepted,true);assert.equal(store.bodies.size,1);assert.equal(store.bodies.get(0).x,100);assert.equal(store.accept(packet(9,patch([b(99)],[],true,99),{epoch:1})).stale,true);assert.equal(store.bodies.has(99),false);
});
test('all four-color 12000 stable grains paint once then use the bitmap, not per-frame vectors',()=>{
 const cache=new Context(),screen=new Context(),renderer=new GridLayerRenderer({createCanvas:()=>({getContext:()=>cache})});const bodies=Array.from({length:12000},(_,i)=>b(i,28.875+(i%132)*1.7576,419.125-Math.floor(i/132)*1.522,true,1+i%4));renderer.apply(patch(bodies,[],true));renderer.configure(576,864,'standard');renderer.draw(screen);assert.equal(cache.polygons,12000);assert.equal(renderer.read().stableCount,12000);assert.equal(renderer.read().lastDynamicPaints,0);renderer.draw(screen);assert.equal(cache.polygons,12000);assert.equal(renderer.read().lastStablePaints,0);assert.equal(screen.images,2);assert.equal(renderer.read().countsConserved,true);
 renderer.apply(patch([b(0,34,419.125,false,1)]));const before=cache.polygons;renderer.draw(screen);assert.equal(renderer.read().dynamicCount,1);assert.equal(renderer.read().stableCount,11999);assert.equal(renderer.read().lastDynamicPaints,1);assert.ok(cache.polygons-before<12000);assert.ok(cache.clears.some(([x,y,w,h])=>x<=28.875*2&&x+w>=28.875*2&&y<=419.125*2&&y+h>=419.125*2));
 renderer.apply(patch([], [0]));renderer.draw(screen);assert.equal(renderer.read().liveCount,11999);assert.equal(renderer.read().lastDynamicPaints,0);
});
test('tile border deletion clears old pixels and redraws its surviving neighbor',()=>{
 const cache=new Context(),renderer=new GridLayerRenderer({createCanvas:()=>({getContext:()=>cache})}),screen=new Context();renderer.apply(patch([b(1,31.5,50),b(2,33.25,50, true,2)],[],true));renderer.configure(576,864,'standard');renderer.draw(screen);cache.paths=[];cache.clears=[];renderer.apply(patch([], [1]));renderer.draw(screen);
 assert.ok(cache.clears.some(([x,y,w,h])=>x<31.5*2&&x+w>=31.5*2));assert.ok(cache.clears.some(([x,y,w,h])=>x<=32*2&&x+w>32*2));assert.ok(cache.paths.length>0);const dx=.87*Math.cos(Math.PI/8);assert.ok(cache.paths.every(p=>Math.abs(p[0][0]-dx-33.25)<1e-9),'Removed old grain must never be repainted; border neighbor must be restored');
});
test('sleep/wake/remove/full restart and theme/resize preserve cache identity and honest fallback',()=>{
 const cache=new Context(),screen=new Context(),r=new GridLayerRenderer({createCanvas:()=>({getContext:()=>cache})});r.apply(patch([b(0,50,50,false)],[],true));r.configure(576,864,'a');r.draw(screen);assert.equal(r.read().lastDynamicPaints,1);r.apply(patch([b(0,51,50,true)]));r.draw(screen);assert.equal(r.read().stableCount,1);assert.equal(r.read().dynamicCount,0);const full=r.read().fullCacheRebuilds;r.configure(864,1296,'b');r.draw(screen);assert.equal(r.read().fullCacheRebuilds,full+1);r.apply(patch([],[],true));r.draw(screen);assert.equal(r.read().liveCount,0);assert.equal(r.read().stableCount,0);assert.equal(r.read().lastStablePaints,0);assert.deepEqual(cache.clears.at(-1),[0,0,864,1296]);
 const fallback=new GridLayerRenderer({createCanvas:()=>({getContext:()=>null})});fallback.apply(patch([b(1),b(2,35,400,false,2)],[],true));fallback.configure(576,864,'a');fallback.draw(screen);assert.equal(fallback.read().mode,'full-vector-fallback');assert.match(fallback.read().fallbackReason,/unavailable/);assert.equal(fallback.read().lastDynamicPaints,2);
});
test('clear overlay follows actual existing IDs and vanishes on clear completion/restart',()=>{
 const bodies=new Map([[1,b(1)],[2,b(2)]]);assert.deepEqual(clearHighlightBodies({clearIds:[1,1,2,99]},bodies).map(p=>p.id),[1,2]);bodies.delete(1);assert.deepEqual(clearHighlightBodies({clearIds:[1,2]},bodies).map(p=>p.id),[2]);assert.equal(clearHighlightBodies({clearIds:[]},bodies).length,0);bodies.clear();assert.equal(clearHighlightBodies({clearIds:[1,2]},bodies).length,0);
});
test('old ack/fatal/visibility/ready are uniformly stale; UI keeps old visual and input system',async()=>{
 for(const type of['ack','fatal','visibility','ready','snapshot'])assert.equal(staleEpoch({type,epoch:1},2),true);const source=await readFile(new URL('../app.mjs',import.meta.url),'utf8'),html=await readFile(new URL('../index.html',import.meta.url),'utf8');assert.match(source,/if \(staleEpoch\(data, epoch\)\)/);assert.match(source,/grainform:0\.4\.8:grid:best/);assert.doesNotMatch(source,/grainform:0\.4\.5/);assert.match(source,/ctx\.globalAlpha = settings.motion/);assert.match(source,/clearHighlightBodies\(snapshot, bodyStore.bodies\)/);assert.match(source,/bodyStore\.array\(\)/);assert.doesNotMatch(source,/snapshot\.bodies\s*\|\|/);assert.match(html,/不是旧版连续圆物理/);for(const control of['left','right','rotate','down','drop'])assert.match(html,new RegExp(`data-action="${control}"`));
});

test('visual invalidation ignores diagnostic clocks and retains pose, epoch and clear animation',async()=>{
 const {visualFrameKey}=await import('../app.mjs');const s={tick:10,active:{x:30,y:40,color:1,shape:[[0,0]]},next:{color:2,shape:[[1,0]]},clearIds:[]},store={epoch:1,revision:10},settings={motion:true,contrast:false};const key=()=>visualFrameKey(s,store,settings,5);const initial=key();s.tick++;s.score=123;s.time=100;assert.equal(key(),initial);s.active.y++;assert.notEqual(key(),initial);s.active.y--;store.epoch++;assert.notEqual(key(),initial);store.epoch--;store.revision++;assert.notEqual(key(),initial);store.revision--;s.clearIds=[1];const clear=key();s.tick++;assert.notEqual(key(),clear);settings.motion=false;const reduced=key();s.tick++;assert.equal(key(),reduced);s.clearIds=[];assert.notEqual(key(),reduced);
});
