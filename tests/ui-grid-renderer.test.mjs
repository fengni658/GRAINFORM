import test from 'node:test';
import assert from 'node:assert/strict';
import { GridBodyStore, clearHighlightBodies, staleEpoch } from '../app.mjs';
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
test('clear overlay follows actual existing IDs and vanishes on clear completion/restart',()=>{
 const bodies=new Map([[1,b(1)],[2,b(2)]]);assert.deepEqual(clearHighlightBodies({clearIds:[1,1,2,99]},bodies).map(p=>p.id),[1,2]);bodies.delete(1);assert.deepEqual(clearHighlightBodies({clearIds:[1,2]},bodies).map(p=>p.id),[2]);assert.equal(clearHighlightBodies({clearIds:[]},bodies).length,0);bodies.clear();assert.equal(clearHighlightBodies({clearIds:[1,2]},bodies).length,0);
});
test('old ack/fatal/visibility/ready are uniformly stale; UI keeps old visual and input system',async()=>{
 for(const type of['ack','fatal','visibility','ready','snapshot'])assert.equal(staleEpoch({type,epoch:1},2),true);const source=await readFile(new URL('../app.mjs',import.meta.url),'utf8'),html=await readFile(new URL('../index.html',import.meta.url),'utf8');assert.match(source,/if \(staleEpoch\(data, epoch\)\)/);assert.match(source,/grainform:0\.4\.8:grid:best/);assert.doesNotMatch(source,/grainform:0\.4\.5/);assert.match(source,/ctx\.globalAlpha = settings.motion/);assert.match(source,/clearHighlightBodies\(snapshot, bodyStore.bodies\)/);assert.match(source,/bodyStore\.array\(\)/);assert.doesNotMatch(source,/snapshot\.bodies\s*\|\|/);assert.match(html,/0\.4\.9 测试版/);for(const control of['left','right','rotate','down','drop'])assert.match(html,new RegExp(`data-action="${control}"`));
});

test('visual invalidation ignores diagnostic clocks and retains pose, epoch and clear animation',async()=>{
 const {visualFrameKey}=await import('../app.mjs');const s={tick:10,active:{x:30,y:40,color:1,shape:[[0,0]]},next:{color:2,shape:[[1,0]]},clearIds:[]},store={epoch:1,revision:10},settings={motion:true,contrast:false};const key=()=>visualFrameKey(s,store,settings,5);const initial=key();s.tick++;s.score=123;s.time=100;assert.equal(key(),initial);s.active.y++;assert.notEqual(key(),initial);s.active.y--;store.epoch++;assert.notEqual(key(),initial);store.epoch--;store.revision++;assert.notEqual(key(),initial);store.revision--;s.clearIds=[1];const clear=key();s.tick++;assert.notEqual(key(),clear);settings.motion=false;const reduced=key();s.tick++;assert.equal(key(),reduced);s.clearIds=[];assert.notEqual(key(),reduced);
});
