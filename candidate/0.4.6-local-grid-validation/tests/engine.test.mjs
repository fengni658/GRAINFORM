import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalSandWorld,SAND_CONTRACT as C,slotPosition,rowColumns,auditCircles} from '../engine.mjs';

const fill=(n,{color=1,startRow=0}={})=>{const out=[];for(let row=startRow;out.length<n;row++)for(let col=0;col<rowColumns(row)&&out.length<n;col++)out.push({id:out.length,row,col,color:typeof color==='function'?color(out.length):color});return out;};
function settle(world,limit=2400){for(let i=0;i<limit&&world.stats().active;i++){world.step();const s=world.stats();assert.ok(s.lastTick.visits<=s.live,'active queue visits each live grain at most once per tick');assert.ok(s.lastTick.maxMovesPerParticle<=1);assert.equal(s.active,s.queued);}assert.equal(world.stats().active,0,`Did not settle in ${limit} ticks`);return world.snapshot();}
function assertStable(snapshot){const occupied=new Set(snapshot.particles.map(p=>`${p.row},${p.col}`));for(const p of snapshot.particles){assert.ok(p.sleep);if(!p.row)continue;const shift=(p.row&1)?0:-1;for(const col of [p.col+shift,p.col+shift+1])if(col>=0&&col<rowColumns(p.row-1))assert.ok(occupied.has(`${p.row-1},${col}`),`Sleeping grain ${p.id} has an empty immediate down slot`);}}

test('triangular endpoints fit exact walls/floor and satisfy independent circle geometry',()=>{
 assert.ok(C.spacing>=1.754);assert.equal(rowColumns(0),132);assert.equal(rowColumns(1),131);
 assert.equal(slotPosition(0,0).x,C.left+C.radius);assert.equal(slotPosition(0,131).x,C.right-C.radius);assert.equal(slotPosition(0,0).y,C.floor-C.radius);
 const w=new LocalSandWorld();assert.ok(w.addMany(fill(4056)).accepted);const report=auditCircles(w.snapshot());assert.ok(report.passed,JSON.stringify(report));assert.equal(report.maxOverlap,0);
 assert.throws(()=>slotPosition(0,132));assert.equal(w.at(0,132),null);
});

test('atomic add rejects occupied, duplicate/retired id, bad color, bounds and full capacity without dropping old particles',()=>{
 const w=new LocalSandWorld({maxRows:1});assert.ok(w.add({id:'a',row:0,col:0,color:1}).accepted);
 const before=w.snapshot();
 for(const batch of [[{id:'b',row:0,col:1,color:2},{id:'c',row:0,col:0,color:3}],[{id:'a',row:0,col:2,color:2}],[{id:'b',row:0,col:2,color:5}],[{id:'b',row:1,col:0,color:2}]]){assert.equal(w.addMany(batch).accepted,false);assert.deepEqual(w.snapshot(),before);}
 assert.ok(w.addMany(Array.from({length:131},(_,i)=>({id:`more-${i}`,row:0,col:i+1,color:2}))).accepted);
 const full=w.snapshot();assert.equal(w.add({row:0,col:0,color:1}).reason,'capacity');assert.deepEqual(w.snapshot(),full);assert.equal(w.stats().live,132);
 assert.deepEqual(w.remove(['a']).removedIds,['a']);assert.equal(w.add({id:'a',row:0,col:0,color:1}).reason,'duplicate-or-retired-id');assert.ok(w.add({id:'new',row:0,col:0,color:1}).accepted);
 assert.equal(w.snapshot({includeDead:true}).particles.find(p=>p.id==='a').alive,false);
});

test('world-coordinate add snaps to a legal endpoint, never silently shifts an occupied insertion',()=>{
 const w=new LocalSandWorld(),target=slotPosition(4,20);assert.ok(w.add({id:1,x:target.x+.05,y:target.y-.05,color:4}).accepted);assert.deepEqual([w.snapshot().particles[0].row,w.snapshot().particles[0].col],[4,20]);assert.equal(w.add({id:2,x:target.x,y:target.y,color:1}).reason,'occupied-slot');assert.equal(w.add({id:3,x:0,y:0,color:1}).reason,'invalid-slot');
});

test('fixed 120Hz gravity credit prevents one-slot-per-tick fall and limits each grain to one move',()=>{
 const w=new LocalSandWorld();w.add({id:'fall',row:100,col:65,color:1});const y0=w.snapshot().particles[0].y;let integrated=0,lastRow=100,moves=0;
 for(let tick=1;tick<=180;tick++){
  w.step();const p=w.snapshot().particles[0],s=w.stats();integrated+=Math.min(60,240*tick/120)/120;
  assert.ok(p.y-y0<=integrated+1e-8,'position cannot spend more accumulated vertical credit than supplied');assert.ok(lastRow-p.row===0||lastRow-p.row===1);assert.ok(p.vy<=60);assert.equal(s.lastTick.creditIntegrations,1);assert.ok(p.motionCredit<C.rowHeight+.5+1e-8);if(p.row!==lastRow)moves++;lastRow=p.row;
  if(tick<=13)assert.equal(p.row,100,'initial credit has not earned a slot yet');
 }
 assert.ok(moves>30&&moves<70);assert.equal(w.tick,180);assert.equal(w.time,1.5);assert.equal(w.stats().totals.moves,moves);assert.equal(w.snapshot().interpolation,'snap-only');
});

test('roll only into vacant slot with further descent; roll budget forbids consecutive side slipping',()=>{
 // Supports directly below (row4,col10); row4,col11 is empty and its outer
 // below slot (row3,col11) is empty, so exactly one right roll is legal.
 const w=new LocalSandWorld();w.addMany([{id:'supportL',row:3,col:9,color:2},{id:'supportR',row:3,col:10,color:2},{id:'grain',row:4,col:10,color:1}]);
 // Freeze supports with complete bottom rows, using IDs distinct from the fixture.
 const base=fill(132+131+132).map(p=>({...p,id:`base-${p.id}`,color:3}));assert.ok(w.addMany(base).accepted);
 let rolled=false,thenDescended=false,last=null;
 for(let i=0;i<100;i++){
  w.step();const p=w.snapshot().particles.find(p=>p.id==='grain');if(last&&p.row===last.row&&p.col!==last.col){assert.equal(last.mustDescendAfterRoll,false);rolled=true;assert.equal(p.mustDescendAfterRoll,true);}if(rolled&&last&&p.row<last.row){thenDescended=true;break;}last=p;
 }
 assert.ok(rolled,'fixture must exercise a horizontal roll');assert.ok(thenDescended,'roll must be followed by descent');assert.ok(auditCircles(w.snapshot()).passed);
});

test('blocked row cannot slide sideways merely because its neighbor slot is empty',()=>{
 const w=new LocalSandWorld();w.addMany(fill(132+131));w.add({id:'top',row:2,col:50,color:4});w.step();const p=w.snapshot().particles.find(p=>p.id==='top');assert.equal(p.row,2);assert.equal(p.col,50);assert.ok(p.sleep);assert.equal(w.stats().active,0);
});

for(const count of [4056,12000])test(`${count} dense grains settle locally and idle step visits zero particles`,()=>{
 const w=new LocalSandWorld();assert.ok(w.addMany(fill(count,{color:i=>i%4+1})).accepted);settle(w,100);const before=w.stats();assert.equal(before.live,count);assert.equal(before.sleeping,count);assert.equal(before.firstTick.visits,count);const revision=before.revision;w.step(240);const after=w.stats();assert.equal(after.totals.visits,before.totals.visits);assert.equal(after.totals.moves,before.totals.moves);assert.equal(after.lastTick.visits,0);assert.equal(after.lastTick.neighborVisits,0);assert.equal(after.revision,revision);assert.equal(after.totals.idleTicks-before.totals.idleTicks,240);assert.ok(auditCircles(w.snapshot()).passed);assertStable(w.snapshot());
});

test('removal preserves survivor IDs and local wake cascade leaves no sleeping unsupported grain',()=>{
 const w=new LocalSandWorld();w.addMany(fill(4056));settle(w);const before=w.snapshot(),ids=before.particles.filter(p=>p.row<8&&p.col>=20&&p.col<=110).map(p=>p.id),survivors=before.particles.filter(p=>!ids.includes(p.id)).map(p=>p.id),oldY=new Map(before.particles.map(p=>[p.id,p.y]));
 const removed=w.remove(ids);assert.equal(removed.removedIds.length,ids.length);assert.ok(w.stats().active>0);assert.ok(w.stats().active<w.stats().live,'deletion must not wake the whole field by scanning it');
 const after=settle(w,1600);assert.deepEqual(after.particles.map(p=>p.id),survivors);assert.ok(after.particles.some(p=>p.y>oldY.get(p.id)+1));assert.ok(auditCircles(after).passed);assertStable(after);assert.equal(w.stats().totals.maxMovesPerParticle,1);
});

test('large bottom deletion wakes the full necessary cascade without whole-field sweeps',()=>{
 const w=new LocalSandWorld();w.addMany(fill(12000));settle(w);const removedIds=w.snapshot().particles.filter(p=>p.row<=22).map(p=>p.id);w.remove(removedIds);const activeInitially=w.stats().active;assert.ok(activeInitially>0&&activeInitially<w.stats().live);const deletionTick=w.tick;const after=settle(w,3200);assert.equal(w.tick-deletionTick,2447,'retain the observed long tail rather than claiming the 2400-tick bench gate passed');assert.equal(after.particles.length,12000-removedIds.length);assertStable(after);assert.ok(auditCircles(after).passed);
});

test('queue dedup and per-tick budgets survive dense repeated local wakes',()=>{
 const w=new LocalSandWorld();w.addMany(fill(800));settle(w);w.remove(w.snapshot().particles.filter(p=>p.row===0&&p.col%2===0).map(p=>p.id));
 for(let t=0;t<200&&w.stats().active;t++){const old=new Map(w.snapshot().particles.map(p=>[p.id,p.row]));w.step();const snap=w.snapshot();assert.ok(snap.stats.lastTick.visits<=snap.particles.length);assert.ok(snap.stats.lastTick.queuePeak<=snap.particles.length);assert.equal(snap.stats.active,snap.stats.queued);for(const p of snap.particles)assert.ok(old.get(p.id)-p.row<=1);}
 assert.ok(auditCircles(w.snapshot()).passed);settle(w);
});

test('same-color connectivity crosses both actual walls; mixed color breaks the bridge',()=>{
 const w=new LocalSandWorld();w.addMany(Array.from({length:132},(_,col)=>({id:col,row:0,col,color:3})));assert.deepEqual(w.connections().crossingColors,[3]);assert.equal(w.connections().spanningComponents[0].ids.length,132);assert.equal(w.connections(),w.connections(),'unchanged topology caches without rescanning');
 w.remove([65]);assert.deepEqual(w.connections().crossingColors,[]);w.add({id:'other',row:0,col:65,color:4});assert.deepEqual(w.connections().crossingColors,[]);w.remove(['other']);w.add({id:'restore',row:0,col:65,color:3});assert.deepEqual(w.connections().crossingColors,[3]);
});

test('independent XY audit detects overlap, bounds, duplicate slot and NaN corruption',()=>{
 const good=[{id:1,row:0,col:0,...slotPosition(0,0)},{id:2,row:0,col:1,...slotPosition(0,1)}];assert.ok(auditCircles(good).passed);
 assert.equal(auditCircles([good[0],{...good[1],x:good[0].x,y:good[0].y}]).passed,false);assert.equal(auditCircles([{...good[0],x:0}]).passed,false);assert.equal(auditCircles([{...good[0],y:NaN}]).passed,false);assert.equal(auditCircles([good[0],{...good[1],row:0,col:0}]).uniqueSlots,false);
});

test('ID removal is atomic for unknown IDs, repeated removal is a no-op, and empty time advances without scanning',()=>{
 const w=new LocalSandWorld();w.add({id:4,row:0,col:0,color:1});const before=w.snapshot();assert.equal(w.remove([4,'missing']).rejected,true);assert.deepEqual(w.snapshot(),before);assert.deepEqual(w.remove([4,4]).removedIds,[4]);assert.deepEqual(w.remove([4]).removedIds,[]);w.step(120);assert.equal(w.time,1);assert.equal(w.stats().totals.visits,0);assert.equal(w.stats().totals.idleTicks,120);assert.equal(w.snapshot({includeDead:true}).particles[0].alive,false);
});
