import test from'node:test';import assert from'node:assert/strict';import{Game as Ref}from'../fixtures/fine-p3-reference.mjs';import{Game as Current,RNG}from'../../dist/preview/reference-0.3-engine.js';
const arrays=['grid','material','vx','vy','fx','fy','energy','sleep','movedAt','departureDrop','surface','activeChunks','nextChunks','rigid','clearMask'];
function same(a,b){for(const key of arrays)assert.deepEqual(b[key],a[key],key);assert.deepEqual(b.snapshot(),a.snapshot());assert.deepEqual(b.active,a.active);assert.deepEqual(b.next,a.next);assert.deepEqual(b.consumeEvents(),a.consumeEvents());assert.equal(b.physicsRng.state,a.physicsRng.state);assert.equal(b.pieceRng.state,a.pieceRng.state);}
test('Historical 0.3 granular and rigid dynamics match frozen P3 with clearing disabled in both engines',()=>{
  const a=new Ref({seed:811}),b=new Current({seed:811});
  // Connectivity intentionally changed in 0.2.1. Keep the frozen reference untouched
  // and isolate physics here; an independent eight-neighbor oracle tests clearing.
  for(const g of[a,b]){g.connectionEnabled=false;g.start();}
  let games=0;
  for(let t=0;t<1200;t++){
    if(a.state==='over'){for(const g of[a,b]){g.reset(812+games);g.connectionEnabled=false;g.start();}games++;}
    for(const g of[a,b]){
      if(g.active&&t%28===0){g.move([0,72,144,216,36,108,180][g.pieces%7]-g.active.x);if(t%3===0)g.rotate();g.hardDrop();}
      g.step({softDrop:t%4===0});
    }
    same(a,b);
  }
});
test('Historical 0.3 stationary-interior shortcut is equivalent with varied velocities, fractions, wake flags and energy',()=>{const a=new Ref({width:61,height:65}),b=new Current({width:61,height:65}),rng=new RNG(527);for(let i=0;i<a.size;i++){for(const g of[a,b]){g.state='playing';g.spawnDelay=1e9;g.connectionEnabled=false;}const vals=[rng.int(4),1+rng.int(255),rng.int(101)-50,rng.int(58)-6,rng.int(32)-16,rng.int(32),rng.int(4)];for(const g of[a,b]){[g.grid[i],g.material[i],g.vx[i],g.vy[i],g.fx[i],g.fy[i],g.energy[i]]=vals;if(g.grid[i])g.added++;}}for(const g of[a,b])g.wakeAll();for(let t=0;t<30;t++){a.step();b.step();same(a,b);}});
