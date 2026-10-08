import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Game,VERSION,SHAPES,rotateShape,RNG,cellSlots,R,D,DT,BLOCK,LEFT,RIGHT,FLOOR,PER_CELL,PER_PIECE} from '../game.mjs';
import {GridWorld,SAND_CONTRACT as C,slotPosition,rowColumns,auditCircles} from '../grid-world.mjs';
const clone=x=>structuredClone(x);
const canonical=shape=>shape.map(p=>p.join(',')).sort().join(';');
function started(shape=SHAPES[0],color=1){const g=new Game({seed:123});g.next={shape:shape.map(p=>p.slice()),color};g.start();return g;}
function floorRow(world,color=1,row=0){const specs=Array.from({length:rowColumns(row)},(_,col)=>({row,col,color}));const result=world.addMany(specs);assert.ok(result.accepted,result.reason);return result.addedIds;}
function assertGeometry(world){const report=auditCircles(world.bodies());assert.ok(report.passed,JSON.stringify(report));assert.equal(new Set(world.bodies().map(p=>`${p.row},${p.col}`)).size,world.stats().live);}

test('0.4.7 retains the low-load grid contract with revised gravity and no old solver runtime import',async()=>{
 assert.equal(VERSION,'0.4.7');assert.equal(new Game().solver,'grid');assert.equal(R,.875);assert.equal(D,1.75);assert.equal(DT,1/120);assert.equal(PER_CELL,169);assert.equal(PER_PIECE,676);
 assert.equal(C.gravity,900);assert.equal(C.fallSpeedCap,180);
 const game=await readFile(new URL('../game.mjs',import.meta.url),'utf8');assert.doesNotMatch(game,/from ['"]\.\/physics|from ['"]\.\/legacy-preview/);
});

test('seven shapes, four rotations, four colors and original seeded RNG remain intact',()=>{
 assert.equal(SHAPES.length,7);assert.equal(new Set(SHAPES.map(canonical)).size,7);for(const shape of SHAPES){let s=shape;for(let i=0;i<4;i++)s=rotateShape(s);assert.equal(canonical(s),canonical(shape));}
 const a=new RNG(785),b=new RNG(785);for(let i=0;i<100;i++)assert.equal(a.next(),b.next());const g=new Game(),colors=new Set(),shapes=new Set();for(let i=0;i<1000;i++){const p=g.randomPiece();colors.add(p.color);shapes.add(canonical(p.shape));}assert.deepEqual([...colors].sort(),[1,2,3,4]);assert.equal(shapes.size,7);
});

test('all 82973 legal integer 24x24 cell poses contain at least 175 fully contained lattice circles',()=>{
 let minimum=Infinity,poses=0,witness;
 for(let x=LEFT;x<=RIGHT-BLOCK;x++)for(let y=0;y<=FLOOR-BLOCK;y++){const slots=cellSlots(x,y);poses++;if(slots.length<minimum){minimum=slots.length;witness={x,y};}assert.ok(slots.length>=PER_CELL,`${x},${y}: ${slots.length}`);}
 assert.equal(poses,82973);assert.equal(minimum,175);assert.deepEqual(witness,{x:29,y:0});assert.deepEqual(cellSlots(27,0),[]);assert.deepEqual(cellSlots(28,397),[]);
});

test('all seven pieces/four rotations at left-center-right and top-middle-floor admit exactly 169 per cell / 676 total',()=>{
 for(let shapeIndex=0;shapeIndex<7;shapeIndex++){let shape=SHAPES[shapeIndex];for(let turn=0;turn<4;turn++,shape=rotateShape(shape)){
  const width=(Math.max(...shape.map(p=>p[0]))+1)*BLOCK,height=(Math.max(...shape.map(p=>p[1]))+1)*BLOCK;
  for(const x of [LEFT,Math.floor((LEFT+RIGHT-width)/2),RIGHT-width])for(const y of [0,Math.floor((FLOOR-height)/2),FLOOR-height]){
   const g=started(shape,1+(shapeIndex+turn)%4);g.active={...g.active,x,y};const points=g.grainPositions(g.active);assert.equal(points.length,676);assert.equal(new Set(points.map(p=>`${p.row},${p.col}`)).size,676);
   for(const [bx,by]of shape){const x0=x+bx*BLOCK,y0=y+by*BLOCK,inside=points.filter(p=>p.x-R>=x0-1e-9&&p.x+R<=x0+BLOCK+1e-9&&p.y-R>=y0-1e-9&&p.y+R<=y0+BLOCK+1e-9);assert.equal(inside.length,169);}
   assert.equal(g.land(),true);assert.equal(g.world.stats().live,676);assert.equal(g.added,676);assert.equal(g.pieces,1);assertGeometry(g.world);
  }
 }}
});

test('newborn cell fills lower rows without interior sampling holes, with only a partial upper boundary',()=>{
 const g=started();g.active={shape:SHAPES[0],x:29,y:0,color:1};const selected=g.grainPositions(g.active).filter(p=>p.x-R>=29-1e-9&&p.x+R<=53+1e-9&&p.y-R>=-1e-9&&p.y+R<=24+1e-9),all=cellSlots(29,0);
 assert.equal(selected.length,169);const upper=Math.max(...selected.map(p=>p.row));for(const p of all)if(p.row<upper)assert.ok(selected.some(q=>q.row===p.row&&q.col===p.col));
 assert.ok(selected.some(p=>p.row===Math.min(...all.map(p=>p.row))));
});

test('atomic admission rejects occupied slots without moving old sand or committing IDs',()=>{
 const w=new GridWorld();const b=w.add({row:0,col:0,color:1});w.consumeChanges();const before=clone(w.snapshot());const result=w.addMany([{row:0,col:1,color:2},{row:0,col:0,color:3}]);assert.equal(result.accepted,false);assert.deepEqual(w.snapshot(),before);assert.equal(w.consumeChanges().upsert.length,0);assert.equal(w.add({row:0,col:1,color:4}).id,b.id+1);
 const g=started();g.active.y=200;assert.ok(g.world.add({x:132,y:210,color:4}));const particles=clone(g.world.bodies()),active=clone(g.active);assert.throws(()=>g.land(),/Atomic grid landing rejected/);assert.deepEqual(g.world.bodies(),particles);assert.deepEqual(g.active,active);assert.equal(g.added,0);assert.equal(g.state,'playing','invalid lower-field admission cannot masquerade as a real top-out');
});

test('wall movement, rotation kick, soft drop and hard-drop score preserve original rigid controls',()=>{
 const g=started();assert.equal(g.move(-288),true);assert.equal(g.active.x,LEFT);assert.equal(g.move(-1),false);assert.equal(g.move(288),true);assert.equal(g.active.x+48,RIGHT);assert.equal(g.move(1),false);
 const tee=started(rotateShape(SHAPES[2]));tee.move(288);const x=tee.active.x;assert.equal(tee.rotate(),true);assert.equal(tee.active.x,x-BLOCK);assert.ok(tee.canPlace(tee.active));
 const dropping=started();dropping.active.y=100;assert.equal(dropping.softDrop(),true);assert.equal(dropping.active.y,112);const distance=FLOOR-48-112;assert.equal(dropping.drop(),true);assert.equal(dropping.score,Math.floor(distance/BLOCK)*2);assert.equal(dropping.world.stats().live,676);assertGeometry(dropping.world);
});

test('actual top obstruction ends play without admitting or deleting a piece',()=>{
 const g=new Game();g.next={shape:SHAPES[0],color:1};const b=g.world.add({x:132,y:12,color:4});assert.ok(b);g.start();assert.equal(g.state,'over');assert.equal(g.active,null);assert.equal(g.world.stats().live,1);assert.equal(g.added,0);assert.equal(g.pieces,0);assert.equal(g.step(),false);assert.ok(b.alive);
});

test('grid six-neighbor same-color crossings retain normalized score, chain and level math',()=>{
 const g=started(),one=floorRow(g.world,1,0),two=floorRow(g.world,3,2),other=g.world.add({row:10,col:60,color:4});g.level=3;const groups=g.findConnections();assert.equal(groups.length,2);assert.equal(g.removeGroups(groups),264);assert.equal(g.score,Math.round((264*64/169+200)*3));assert.equal(g.rawCleared,264);assert.equal(g.cleared,Math.floor(264*64/169));assert.equal(g.lines,2);assert.equal(g.chain,1);assert.ok(other.alive);assert.ok([...one,...two].every(id=>!g.world.bs[id].alive));assert.equal(g.removeGroups(groups),0);
 const third=floorRow(g.world,2,0);const prior=g.score;g.level=2;g.removeGroups([third]);assert.equal(g.score,prior+Math.round((132*64/169+100)*2*2));assert.equal(g.chain,2);g.rawCleared=Math.ceil(1800*169/64)-1;g.removeGroups([[other.id]]);assert.equal(g.cleared,1800);assert.equal(g.level,2);
 const gap=started();floorRow(gap.world,1);gap.world.remove(65);assert.deepEqual(gap.findConnections(),[]);gap.world.add({row:0,col:65,color:2});assert.deepEqual(gap.findConnections(),[]);
});

test('0.2-second clear freezes all sand and rigid state, then deletes and locally wakes support dependents',()=>{
 const g=started();const base=floorRow(g.world,2);const top=g.world.add({row:1,col:60,color:4});g.world.tick=15;g.world.time=15*DT;g.gameTick=15;g.time=15*DT;g.step();assert.equal(g.clearTimer,.2);assert.deepEqual(g.pendingClear,[base]);const frozen=clone(g.world.bodies()),rigid=clone(g.active),physicsTick=g.world.tick;
 g.pause();const paused=clone(g.snapshot());assert.equal(g.step(),false);assert.deepEqual(g.snapshot(),paused);g.resume();
 for(let i=0;i<24;i++){g.step();assert.equal(g.world.tick,physicsTick);assert.deepEqual(g.active,rigid);if(i<23)assert.deepEqual(g.world.bodies(),frozen);}
 assert.equal(g.clearTimer,0);assert.equal(g.world.stats().live,1);assert.equal(g.rawCleared,132);assert.equal(top.sleep,false);assert.equal(g.world.active.has(top.id),true);assert.equal(top.y,frozen.find(p=>p.id===top.id).y);g.step();assert.equal(g.world.tick,physicsTick+1);assert.ok(top.motionCredit>0);
});

test('metadata and incremental frames never require a full body snapshot or all-field diff',()=>{
 const g=started();floorRow(g.world,1);const full=g.frame({full:true});assert.equal(full.bodyPatch.reset,true);assert.equal(full.bodyPatch.upsert.length,132);const lastRevision=full.bodyPatch.revision;
 const originalBodies=g.world.bodies;g.world.bodies=()=>{throw new Error('unexpected full body scan');};g.world.snapshot=()=>{throw new Error('unexpected local snapshot scan');};
 assert.equal(g.snapshot({includeBodies:false}).bodies,undefined);g.world.step();const patch=g.frame();assert.equal(patch.bodyPatch.previousRevision,lastRevision);assert.equal(patch.bodyPatch.upsert.length,132,'sleep transitions are incremental dirty events');assert.ok(patch.bodyPatch.upsert.every(p=>p.sleep));assert.equal(patch.bodies,undefined);assert.equal(g.frame().bodyPatch.upsert.length,0);g.world.bodies=originalBodies;
});

test('dirty patches reconstruct exact visible bodies across add, motion, sleep, remove and wake',()=>{
 const w=new GridWorld(),client=new Map();let revision=0;
 const apply=p=>{if(p.reset)client.clear();else assert.equal(p.previousRevision,revision);for(const id of p.removed)client.delete(id);for(const b of p.upsert)client.set(b.id,b);revision=p.revision;};
 w.addMany([{row:0,col:50,color:1},{row:1,col:49,color:2},{row:8,col:50,color:3}]);apply(w.consumeChanges({full:true}));
 for(let i=0;i<45;i++){w.step();if(i%3===0){apply(w.consumeChanges());assert.deepEqual([...client.values()].sort((a,b)=>a.id-b.id),w.bodies());}}
 w.remove(0);apply(w.consumeChanges());assert.deepEqual([...client.values()].sort((a,b)=>a.id-b.id),w.bodies());const empty=w.consumeChanges();assert.equal(empty.upsert.length,0);assert.equal(empty.removed.length,0);
});

test('pause, reset and seeded gameplay are deterministic under the revised local rules',()=>{
 const replay=()=>{const g=started();g.move(-24);g.rotate();g.softDrop();for(let i=0;i<40;i++)g.step();g.drop();for(let i=0;i<160;i++)g.step();g.pause();const before=clone(g.snapshot());for(let i=0;i<4;i++)assert.equal(g.step(),false);assert.deepEqual(g.snapshot(),before);g.resume();g.step();assertGeometry(g.world);return clone(g.snapshot());};assert.deepEqual(replay(),replay());
 const g=started();g.drop();g.world.step();g.frame();g.reset(123);assert.deepEqual(g.snapshot(),new Game({seed:123}).snapshot());assert.equal(g.world.active.size,0);assert.equal(g.world.grid.size,0);assert.deepEqual(g.frame().bodyPatch.upsert,[]);
});

test('bounded multi-piece real play preserves conservation and geometric endpoints',()=>{
 const g=new Game({seed:91571});g.start();for(let t=0;t<720&&g.state==='playing';t++){if(g.active&&t%60===0){g.move(t%120?-24:24);g.rotate();g.drop();}g.step();if(t%120===0)assertGeometry(g.world);assert.equal(g.world.stats().live,g.added-g.rawCleared);}
 assert.ok(g.pieces>=3);assert.equal(g.added,g.pieces*676);assertGeometry(g.world);assert.equal(g.world.stats().totals.maxMovesPerParticle<=1,true);
});


test('expected full-capacity admission is a clean restartable gameover with zero particles or hard-drop score committed',()=>{
 const g=started();g.world.maxParticles=675;const before=g.world.bodies();assert.equal(g.drop(),false);assert.equal(g.state,'over');assert.equal(g.gameOverReason,'grid-admission-capacity');assert.equal(g.active,null);assert.equal(g.score,0);assert.equal(g.added,0);assert.equal(g.pieces,0);assert.deepEqual(g.world.bodies(),before);assert.equal(g.events.at(-1).reason,'grid-admission-capacity');
 g.reset(123);assert.equal(g.gameOverReason,null);assert.equal(g.start(),true);assert.equal(g.drop(),true);assert.equal(g.world.stats().live,676);assertGeometry(g.world);
});

test('typed occupied-slot batch refusal is handled atomically instead of crashing the worker',()=>{
 const g=started();const original=g.world.addMany;g.world.addMany=()=>({accepted:false,addedIds:[],reason:'occupied-slot'});assert.equal(g.land(),false);assert.equal(g.gameOverReason,'grid-admission-occupied-slot');assert.equal(g.state,'over');assert.equal(g.added,0);assert.equal(g.world.stats().live,0);assert.equal(g.score,0);g.world.addMany=original;
});
