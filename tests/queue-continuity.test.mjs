import test from 'node:test';
import assert from 'node:assert/strict';
import {MaterialFrameQueue, MATERIAL_FRAME_MS as D} from '../ca-layer.mjs';
import {MaterialFrameQueue as FrozenQueue} from './fixtures/hybrid-before-queue/ca-layer.mjs';
import {Game} from '../game.mjs';
const frame=token=>({token,ruleTick:token*4,paths:[{id:1,points:[1,1,0,2,1,68]}]});
const context={state:'playing',phase:'settling',pieceId:20,settlingBurst:20};
function create(C=MaterialFrameQueue){const q=new C();q.reset(1);q.setContinuity?.(1,context);return q;}
function empty({raf=0,token=1}={}){const q=create();q.accept(1,[frame(token)],raf-40);assert.equal(q.sample(raf).alpha,1);assert.equal(q.didDraw(raf).token,token);assert.equal(q.queue.length,0);return q;}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('short starvation inherits actual last rAF, never stale startedAt or draw wall',()=>{
 const q=empty();q.accept(1,[frame(2)],10.2);assert.equal(q.startedAt,0);assert.equal(q.sample(16.7).alpha,1);assert.equal(q.didDraw(16.7).token,2);
});
test('recorded 1095/1096: rAF30905.4, draw/ACK30911, arrival30915.6, rAF30922.1',()=>{
 const q=empty({raf:30905.4,token:1095});q.accept(1,[frame(1096)],30915.6);assert.equal(q.startedAt,30905.4);assert.equal(q.sample(30922.1).alpha,1);assert.equal(q.didDraw(30922.1).token,1096);assert.equal(q.sample(30938.7),null);
 const old=create(FrozenQueue);old.accept(1,[frame(1095)],30887.6);old.sample(30905.4);old.didDraw();old.accept(1,[frame(1096)],30915.6);near(old.sample(30922.1).alpha,.39);assert.equal(old.didDraw(),null);assert.equal(old.sample(30938.7).alpha,1);
 // Mistaking completion-wall30911 for rAF yields partial alpha, not a gain.
 assert.ok((30922.1-30911)/D<1);
});
test('recorded old1119/1120: 16.6ms rAF gap remains partial, no epsilon promotion',()=>{const q=empty({raf:33759.5,token:1119});q.accept(1,[frame(1120)],33763.8);near(q.sample(33776.1).alpha,.996);assert.equal(q.didDraw(33776.1),null);assert.equal(q.sample(33792.8).alpha,1);assert.equal(q.didDraw(33792.8).token,1120);});
for(const [name,arrival,expected] of [['same timestamp',0,0],['exact short-window edge',D,0],['outside edge',D+1e-9,D+1e-9],['long computation/delivery gap',500,500],['backward time',-1,-1]])test(name,()=>{const q=empty();q.accept(1,[frame(2)],arrival);assert.equal(q.startedAt,expected);});
for(const [name,change] of [
 ['next piece',q=>q.setContinuity(1,{...context,pieceId:21})],
 ['new burst after unseen transitions',q=>q.setContinuity(1,{...context,settlingBurst:21})],
 ['flash and return',q=>{q.setContinuity(1,{...context,phase:'flash'});q.setContinuity(1,{...context,settlingBurst:21});}],
 ['checking',q=>q.setContinuity(1,{...context,phase:'checking'})],
 ['terminal',q=>q.setContinuity(1,{...context,state:'over',phase:'over'})],
 ['missing burst',q=>q.setContinuity(1,{...context,settlingBurst:undefined})],
 ['pause/resume',q=>{q.setPaused(true,1);q.setPaused(false,2);}],
 ['hidden/resync/failure/restart request invalidation',q=>q.invalidateContinuity()],
 ['full snapshot reset',q=>q.setContinuity(1,context,true)]
])test(name+' invalidates empty anchor',()=>{const q=empty();change(q);q.accept(1,[frame(2)],10.2);assert.equal(q.startedAt,10.2);near(q.sample(16.7).alpha,.39);assert.equal(q.didDraw(16.7),null);});
test('epoch reset rejects stale packets and restarts arrival timing',()=>{const q=empty();q.reset(2);q.setContinuity(2,context);assert.equal(q.accept(1,[frame(2)],5),false);q.accept(2,[frame(1)],10.2);assert.equal(q.startedAt,10.2);near(q.sample(16.7).alpha,.39);});
test('token gap cannot inherit; duplicate/empty snapshots cannot refresh window',()=>{let q=empty();q.accept(1,[frame(3)],10.2);assert.equal(q.startedAt,10.2);q=empty();q.accept(1,[frame(1)],10);q.accept(1,[],15);q.setContinuity(1,context);q.accept(1,[frame(2)],20);assert.equal(q.startedAt,20);});
test('one shot anchor and one receipt per distinct explicit rAF even with backlog',()=>{const q=create();q.accept(1,[frame(1),frame(2)],0);assert.equal(q.didDraw(1000),null);q.sample(1000);assert.equal(q.didDraw(1000).token,1);q.sample(1000);assert.equal(q.didDraw(1000),null);assert.equal(q.queue[0].token,2);q.sample(1016.7);assert.equal(q.didDraw(1016.7).token,2);q.accept(1,[frame(3)],1016.7);assert.equal(q.sample(1016.7).alpha,0);assert.equal(q.didDraw(1016.7),null);q.sample(1033.4);assert.equal(q.didDraw(1033.4).token,3);assert.equal(q.didDraw(1033.4),null);});
test('wrong or omitted rAF cannot fabricate continuity anchor',()=>{const q=create();q.accept(1,[frame(1)],0);q.sample(20);assert.equal(q.didDraw(21),null);assert.equal(q.didDraw().token,1);q.accept(1,[frame(2)],22);assert.equal(q.startedAt,22);});
test('nonempty queue sample/receipt/offset behavior remains exact against frozen queue',()=>{const a=create(),b=create(FrozenQueue);for(const q of[a,b])q.accept(1,[frame(1),frame(2)],0);for(const t of [0,5,16.6,16.7]){assert.deepEqual(a.sample(t),b.sample(t));assert.deepEqual(a.didDraw(t),b.didDraw());}for(const q of[a,b])q.setPaused(true,18);assert.deepEqual(a.sample(100),b.sample(100));for(const q of[a,b])q.setPaused(false,118);assert.equal(a.startedAt,b.startedAt);for(const t of[118,125,134]){assert.deepEqual(a.sample(t),b.sample(t));assert.deepEqual(a.didDraw(t),b.didDraw());}});
test('game owns monotonic burst identity independently of snapshot publication',()=>{const g=new Game({seed:1});assert.equal(g.snapshot().settlingBurst,0);g.start();g.drop();assert.equal(g.snapshot().settlingBurst,1);g.setPhase('settling');assert.equal(g.snapshot().settlingBurst,1);g.setPhase('checking');g.setPhase('flash');g.setPhase('settling');assert.equal(g.snapshot().settlingBurst,2);g.pause();g.resume();assert.equal(g.snapshot().settlingBurst,2);g.reset(1);assert.equal(g.snapshot().settlingBurst,0);});
