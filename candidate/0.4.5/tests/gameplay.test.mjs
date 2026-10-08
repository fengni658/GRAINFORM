import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Game,SHAPES,rotateShape,RNG,R,D,DT,BLOCK,LEFT,RIGHT,FLOOR,PER_CELL,PER_PIECE} from '../game.mjs';
import {World as BaselineWorld,audit as baselineAudit} from '../physics/fast.mjs';
import {World as AdaptiveWorld,audit as adaptiveAudit} from '../physics/adaptive.mjs';

const clone=x=>JSON.parse(JSON.stringify(x));
const canonical=s=>s.map(p=>p.join(',')).sort().join(';');
const alive=g=>g.world.bs.filter(b=>b.alive);
const solvers=['baseline','adaptive'];
function started(solver='baseline',shape=SHAPES[0],color=1){const g=new Game({seed:123,solver});g.next={shape:shape.map(p=>p.slice()),color};assert.equal(g.start(),true);return g;}
function legalAdd(g,p){const b=g.world.add(p);assert.ok(b,`legal fixture add failed at ${JSON.stringify(p)}`);return b;}
function exactContactChain(g,{y=350,color=1,gap=false,mixed=false,inset=0}={}){
 // The wall span for circle centers is 230.25. 132 alternating segments,
 // each D + 0.0002 + 1e-8 long, legally cover both walls without overlap.
 const n=132,x0=LEFT+R+inset,x1=RIGHT-R-inset,dx=(x1-x0)/n;
 const length=D+.0002+1e-8,dy=Math.sqrt(length*length-dx*dx),out=[];
 for(let i=0;i<=n;i++){
  if(gap&&i===66)continue;
  const b=legalAdd(g,{x:x0+i*dx,y:y+(i%2)*dy,color:mixed&&i===66?2:color});out.push(b);
 }
 for(let i=1;i<out.length;i++){
  const distance=Math.hypot(out[i].x-out[i-1].x,out[i].y-out[i-1].y);
  assert.ok(distance>=D+.0002-1e-10,`overlapping contact fixture: ${distance}`);
  if(!gap)assert.ok(distance<=D+.012,`noncontact fixture edge: ${distance}`);
 }
 return out;
}
function assertLegal(g){const audit=g.solver==='baseline'?baselineAudit:adaptiveAudit;const a=audit(g.world);assert.ok(a.passed,JSON.stringify(a));for(const b of alive(g)){assert.ok(Number.isFinite(b.x)&&Number.isFinite(b.y));assert.equal(b.radius,.87);}}

test('legacy RNG, seven shapes and rotations are an unchanged 0.4.1 source copy',async()=>{
 const bytes=await readFile(new URL('../legacy-preview.js',import.meta.url));
 // SHA-256 independently verified against grainform-sites-owner-045/dist/experimental/0.4.1/runtime/preview/engine.js.
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'b3982dc917baf1ef452e005e88598fe3f6caee7530a681c3f6aa384fac115430');
 assert.equal(SHAPES.length,7);assert.equal(new Set(SHAPES.map(canonical)).size,7);
 for(const shape of SHAPES){assert.equal(new Set(shape.map(p=>p.join(','))).size,4);let rotated=shape;for(let i=0;i<4;i++)rotated=rotateShape(rotated);assert.equal(canonical(rotated),canonical(shape));}
 const a=new RNG(785),b=new RNG(785);for(let i=0;i<100;i++)assert.equal(a.next(),b.next());
});
test('baseline is the default; adaptive is explicit; physical and emitted density constants are exact',()=>{
 const g=new Game();assert.equal(g.solver,'baseline');assert.ok(g.world instanceof BaselineWorld);assert.ok(new Game({solver:'adaptive'}).world instanceof AdaptiveWorld);
 assert.equal(R,.875);assert.equal(D,1.75);assert.equal(DT,1/120);assert.equal(PER_CELL,13*13);assert.equal(PER_PIECE,4*PER_CELL);
 const r=new Game({seed:33}),colors=new Set(),shapes=new Set();for(let i=0;i<1000;i++){const p=r.randomPiece();colors.add(p.color);shapes.add(canonical(p.shape));}assert.deepEqual([...colors].sort(),[1,2,3,4]);assert.equal(shapes.size,7);
});
for(const solver of solvers){
 test(`${solver}: all seven pieces in four rotations admit exactly 676 nonoverlapping grains`,()=>{
  for(let s=0;s<SHAPES.length;s++)for(let turn=0;turn<4;turn++){
   const g=started(solver,SHAPES[s],1+(s+turn)%4);
   for(let i=0;i<turn;i++)assert.equal(g.rotate(),true);
   const before=clone(g.active),points=g.grainPositions(g.active);
   assert.equal(points.length,676);assert.equal(new Set(points.map(p=>`${p.x},${p.y}`)).size,676);
   for(const [bx,by] of before.shape){const cell=points.filter(p=>p.x>=before.x+bx*24&&p.x<before.x+(bx+1)*24&&p.y>=before.y+by*24&&p.y<before.y+(by+1)*24);assert.equal(cell.length,169);const rows=[...new Set(cell.map(p=>p.y))];assert.equal(rows.length,13);for(const y of rows){const row=cell.filter(p=>p.y===y);assert.equal(row.length,13);assert.equal(new Set(row.map(p=>p.x)).size,13);}}
   const maxY=Math.max(...before.shape.map(p=>p[1]));const distance=FLOOR-(maxY+1)*BLOCK-before.y;
   assert.equal(g.drop(),true);assert.equal(g.active,null);assert.equal(g.pieces,1);assert.equal(g.added,676);assert.equal(alive(g).length,676);assert.equal(g.world.bs.length,676);assert.equal(g.score,Math.floor(distance/BLOCK)*2);assert.ok(alive(g).every(b=>b.color===before.color));assertLegal(g);
   assert.equal(g.events.at(-1).type,'land');assert.equal(g.events.at(-1).count,676);
  }
 });
 test(`${solver}: wall stops, rotation kick and sand blocking cannot be tunneled by large moves`,()=>{
  const g=started(solver);assert.equal(g.move(-288),true);assert.equal(g.active.x,LEFT);assert.equal(g.move(-24),false);assert.equal(g.move(288),true);assert.equal(g.active.x+48,RIGHT);assert.equal(g.move(24),false);assert.ok(g.canPlace(g.active));
  const stick=started(solver,rotateShape(SHAPES[1]));stick.move(288);assert.equal(stick.active.x+BLOCK,RIGHT);const unrotated=clone(stick.active);assert.equal(stick.rotate(),false);assert.deepEqual(stick.active,unrotated);assert.ok(stick.canPlace(stick.active));
  const tee=started(solver,rotateShape(SHAPES[2]));tee.move(288);assert.equal(tee.active.x+2*BLOCK,RIGHT);const oldX=tee.active.x;assert.equal(tee.rotate(),true);assert.equal(tee.active.x,oldX-BLOCK);assert.ok(tee.canPlace(tee.active));assert.equal(tee.active.x+3*BLOCK,RIGHT);
  const blocked=started(solver);legalAdd(blocked,{x:95,y:12,color:3});assert.equal(blocked.move(-288),true);assert.equal(blocked.active.x,96);assert.equal(blocked.move(-1),false);assert.ok(blocked.canPlace(blocked.active));
  const falling=started(solver);const obstacle=legalAdd(falling,{x:144,y:300,color:4});assert.equal(falling.drop(),true);assert.equal(alive(falling).length,677);assert.ok(obstacle.alive);assert.ok(alive(falling).slice(1).every(b=>Math.hypot(b.x-obstacle.x,b.y-obstacle.y)>=D+.0002));assertLegal(falling);
 });
 test(`${solver}: pause/resume and all nonplaying states do not secretly step or accept control`,()=>{
  const ready=new Game({solver});const original=clone(ready.snapshot());for(let i=0;i<10;i++)assert.equal(ready.step(),false);assert.deepEqual(ready.snapshot(),original);assert.equal(ready.drop(),false);
  const g=started(solver);legalAdd(g,{x:40,y:100,color:3});g.step();assert.equal(g.pause(),true);const before=clone(g.snapshot());const rng=g.rng.state;for(let i=0;i<10;i++){assert.equal(g.step(),false);assert.equal(g.move(20),false);assert.equal(g.rotate(),false);assert.equal(g.softDrop(),false);assert.equal(g.drop(),false);}assert.deepEqual(g.snapshot(),before);assert.equal(g.rng.state,rng);assert.equal(g.resume(),true);assert.equal(g.step(),true);assert.equal(g.world.tick,before.tick+1);assert.ok(g.world.bs[0].y>before.bodies[0].y);
  g.state='over';const terminal=clone(g.snapshot());for(let i=0;i<5;i++)assert.equal(g.step(),false);assert.equal(g.drop(),false);assert.deepEqual(g.snapshot(),terminal);
 });
 test(`${solver}: restart resets world, RNG, score, delays and events exactly`,()=>{
  const g=started(solver);g.drop();g.step();g.pause();g.pendingClear=[[1,2]];g.clearTimer=.1;g.reset(123);
  assert.deepEqual(g.snapshot(),new Game({seed:123,solver}).snapshot());assert.equal(g.spawnDelay,0);assert.equal(g.fall,0);assert.equal(g.clearTimer,0);assert.deepEqual(g.pendingClear,[]);assert.equal(g.events.length,0);assert.equal(g.world.grid.size,0);assert.equal(g.world.active.size,0);assert.equal(g.start(),true);
 });
 test(`${solver}: blocked top spawn causes gameover without losing or adding particles`,()=>{
  const g=new Game({solver});g.next={shape:SHAPES[0].map(p=>p.slice()),color:1};const obstruction=legalAdd(g,{x:132,y:12,color:2});g.start();assert.equal(g.state,'over');assert.equal(g.active,null);assert.equal(g.added,0);assert.equal(g.pieces,0);assert.equal(alive(g).length,1);assert.ok(obstruction.alive);assert.equal(g.events.at(-1).type,'over');assert.equal(g.drop(),false);assert.equal(g.step(),false);
 });
 test(`${solver}: approaching moving sand lands at the original pose before integration; blocked landing is atomic`,()=>{
  for(const [distance,vy] of [[1.3,0],[1.8,-120]]){
   const g=started(solver);g.active.y=200;const obstruction=legalAdd(g,{x:144,y:248+distance,vy,color:2});assert.equal(g.canPlace(g.active),true);assert.equal(g.approachingContact(),true);const positions=g.grainPositions(g.active),pieceRngState=g.rng.state,next=clone(g.next),admitted=[],add=g.world.add.bind(g.world);g.world.add=p=>{const b=add(p);if(b)admitted.push({x:p.x,y:p.y,color:p.color});return b;};
   assert.equal(g.step(),true);assert.equal(g.state,'playing');assert.equal(g.active,null);assert.equal(g.added,676);assert.equal(alive(g).length,677);assert.ok(obstruction.alive);assert.deepEqual(admitted,positions,'admission must use the unchanged falling pose');assert.equal(g.rng.state,pieceRngState,'per-grain jitter must not perturb piece RNG');assert.deepEqual(g.next,next);assertLegal(g);
  }
  for(const y of [0,200]){const blocked=started(solver);blocked.active.y=y;legalAdd(blocked,{x:132,y:y+12,color:4});blocked.land();assert.equal(blocked.state,'over');assert.equal(blocked.active,null);assert.equal(blocked.added,0);assert.equal(alive(blocked).length,1);assert.equal(blocked.events.at(-1).reason,'blocked-landing');}
 });
 test(`${solver}: only an actually contacting same-color chain reaching both walls connects`,()=>{
  const g=started(solver);const chain=exactContactChain(g);assertLegal(g);const groups=g.findConnections();assert.equal(groups.length,1);assert.deepEqual(new Set(groups[0]),new Set(chain.map(b=>b.id)));
  for(const options of [{mixed:true},{gap:true},{inset:.05}]){const negative=started(solver);exactContactChain(negative,options);assert.deepEqual(negative.findConnections(),[],JSON.stringify(options));assertLegal(negative);}
  const nearGap=started(solver),nearChain=exactContactChain(nearGap);const gapBody=nearChain[66];gapBody.y+=.5;nearGap.world.index(gapBody);for(const neighbor of [nearChain[65],nearChain[67]]){assert.ok(nearGap.world.near(neighbor.x,neighbor.y,D+.012).some(b=>b.id===gapBody.id));assert.ok(Math.hypot(neighbor.x-gapBody.x,neighbor.y-gapBody.y)>D+.012);}assert.deepEqual(nearGap.findConnections(),[],'broadphase neighbors must not bridge a noncontact gap');assertLegal(nearGap);
  const broad=started(solver);const a=legalAdd(broad,{x:100,y:200,color:1}),b=legalAdd(broad,{x:102,y:200,color:1});assert.ok(broad.world.near(a.x,a.y,D+.012).some(q=>q.id===b.id),'negative pair must share broadphase lookup');assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>D+.012);assert.deepEqual(broad.findConnections(),[]);
 });
 test(`${solver}: independent same-color regions clear with legacy formula, chain and no lost other colors`,()=>{
  const g=started(solver);const one=exactContactChain(g,{y:320,color:1}),two=exactContactChain(g,{y:330,color:3});const survivor=legalAdd(g,{x:100,y:100,color:4});g.level=3;
  const groups=g.findConnections();assert.equal(groups.length,2);assert.equal(g.removeGroups(groups),266);assert.equal(g.score,Math.round((266*64/169+200)*3));assert.equal(g.chain,1);assert.equal(g.maxChain,1);assert.equal(g.lines,2);assert.equal(g.rawCleared,266);assert.equal(g.cleared,Math.floor(266*64/169));assert.equal(alive(g).length,1);assert.ok(survivor.alive);assert.equal(g.world.active.size,1);assert.ok([...one,...two].every(b=>!b.alive));
  const score=g.score;assert.equal(g.removeGroups(groups),0);assert.equal(g.score,score);assert.equal(g.chain,1);
  const third=exactContactChain(g,{y:340,color:2});g.level=2;assert.equal(g.removeGroups([third.map(b=>b.id)]),133);assert.equal(g.score,score+Math.round((133*64/169+100)*2*2));assert.equal(g.chain,2);assert.equal(g.maxChain,2);assert.equal(g.lines,3);
  assert.equal(g.rawCleared,399);assert.equal(g.cleared,Math.floor(399*64/169));g.rawCleared=Math.ceil(1800*169/64)-1;g.cleared=Math.floor(g.rawCleared*64/169);assert.equal(g.cleared,1799);const last=legalAdd(g,{x:150,y:100,color:4});g.removeGroups([[last.id]]);assert.equal(g.rawCleared,4754);assert.equal(g.cleared,1800);assert.equal(g.level,2);
 });
 test(`${solver}: removing a sleeping support wakes the full stack, and unsupported grains fall`,()=>{
  const g=started(solver),base=legalAdd(g,{x:80,y:FLOOR-R,color:1}),middle=legalAdd(g,{x:80,y:FLOOR-R-(D+.004),color:2}),top=legalAdd(g,{x:80,y:FLOOR-R-2*(D+.004),color:3});
  // Let the actual solver establish sleep and dependency edges; no forced sleep.
  for(let i=0;i<100&&!([base,middle,top].every(b=>b.sleep));i++)g.world.step();
  assert.ok([base,middle,top].every(b=>b.sleep),'anchored three-grain stack should sleep');assert.equal(g.world.active.size,0);assertLegal(g);
  const y0=[middle.y,top.y];g.removeGroups([[base.id]]);assert.equal(base.alive,false);assert.equal(middle.sleep,false);assert.equal(top.sleep,false);assert.ok(g.world.active.has(middle.id));assert.ok(g.world.active.has(top.id));assert.ok(g.world.counters.wakes>=3);
  for(let i=0;i<8;i++)g.world.step();assert.ok(middle.y>y0[0]+.01);assert.ok(top.y>y0[1]+.01);assert.equal(alive(g).length,2);assertLegal(g);
 });
 test(`${solver}: connection scan enters clear animation, blocks input, removes only after its timer`,()=>{
  const g=started(solver);exactContactChain(g,{y:300,color:2});g.gameTick=15;g.time=15*DT;g.world.tick=15;g.world.time=15*DT;
  assert.equal(g.step(),true);assert.ok(g.clearTimer>0);assert.equal(g.pendingClear.length,1);assert.equal(g.events.at(-1).type,'clear-start');assert.equal(alive(g).length,133);assert.equal(g.move(10),false);assert.equal(g.rotate(),false);assert.equal(g.drop(),false);
  assert.equal(g.pause(),true);const paused=clone(g.snapshot()),timer=g.clearTimer;assert.equal(g.step(),false);assert.deepEqual(g.snapshot(),paused);assert.equal(g.clearTimer,timer);g.resume();
  let ticks=0;while(g.clearTimer>0&&ticks<30){g.step();ticks++;}
  assert.ok(ticks>=24&&ticks<=25);assert.equal(g.clearTimer,0);assert.deepEqual(g.pendingClear,[]);assert.equal(alive(g).length,0);assert.equal(g.rawCleared,133);assert.equal(g.cleared,Math.floor(133*64/169));assert.equal(g.lines,1);assert.equal(g.score,Math.round(133*64/169+100));assert.equal(g.events.at(-1).type,'clear');assert.ok(g.acceptsInput());
 });
 test(`${solver}: clear flash freezes physics while gameplay time advances, and pause freezes both`,()=>{
  const g=started(solver);exactContactChain(g,{y:300,color:2});const falling=legalAdd(g,{x:90,y:100,vx:2,vy:15,color:4});g.gameTick=15;g.time=15*DT;g.world.tick=15;g.world.time=15*DT;g.step();assert.ok(g.clearTimer>0);
  const physical=()=>({tick:g.world.tick,time:g.world.time,positions:g.world.bs.map(({id,x,y,vx,vy})=>({id,x,y,vx,vy}))});const frozen=clone(physical());const flashTick=g.gameTick,flashTime=g.time;assert.equal(g.snapshot().physicsTick,g.world.tick);
  g.pause();const paused=clone(g.snapshot()),remaining=g.clearTimer;for(let i=0;i<3;i++)assert.equal(g.step(),false);assert.deepEqual(g.snapshot(),paused);assert.equal(g.clearTimer,remaining);assert.deepEqual(physical(),frozen);g.resume();
  let count=0;while(g.clearTimer>0&&count<30){assert.equal(g.step(),true);count++;assert.deepEqual(physical(),frozen,'no clear-flash tick may secretly run World.step');assert.equal(g.gameTick,flashTick+count);assert.ok(Math.abs(g.time-(flashTime+count*DT))<1e-10);assert.equal(g.snapshot().physicsTick,frozen.tick);}
  assert.ok(count>=24&&count<=25);assert.equal(g.clearTimer,0);assert.equal(g.rawCleared,133);assert.equal(g.snapshot().rawCleared,133);assert.equal(alive(g).length,1);assert.ok(falling.alive);const lastY=falling.y;g.step();assert.equal(g.world.tick,frozen.tick+1);assert.ok(falling.y>lastY);assert.equal(g.gameTick,flashTick+count+1);
 });
 test(`${solver}: natural spawn delay, gravity landing and hard-drop reset are consistent`,()=>{
  const g=started(solver);g.active.y=FLOOR-48;g.chain=4;assert.equal(g.descend(1),false);assert.equal(g.active,null);assert.equal(g.pieces,1);assert.equal(g.added,676);assert.equal(g.score,0);assert.equal(g.chain,0);assert.equal(g.spawnDelay,22/60);
  // Remove this admitted piece via the real World API so the delay can be tested
  // in isolation without spending 44 dense physics ticks on an unrelated load.
  for(const b of alive(g))g.world.remove(b.id);const next=clone(g.next);let steps=0;while(!g.active&&steps<48){g.step();steps++;}assert.ok(steps>=44&&steps<=45);assert.equal(g.active.y,0);assert.deepEqual(g.active.shape,next.shape);assert.equal(g.active.color,next.color);assert.equal(g.pieces,1);
  // Legacy nudgeDown defaults to12; 0.4.5 softDrop preserves this tap distance.
  g.active.y=120;const y=g.active.y;assert.equal(g.softDrop(),true);assert.equal(g.active.y,y+12);assert.equal(g.score,0);
 });
 test(`${solver}: actual bounded input and physics replay is deterministic`,()=>{
  const replay=()=>{const g=new Game({seed:91571,solver});g.start();g.move(-35);g.rotate();g.softDrop();for(let i=0;i<5;i++)g.step();g.drop();for(let i=0;i<5;i++)g.step();g.pause();g.step();g.resume();g.step();assertLegal(g);return clone(g.snapshot());};
  assert.deepEqual(replay(),replay());
 });
}
