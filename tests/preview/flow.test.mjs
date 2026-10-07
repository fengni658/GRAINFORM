import test from'node:test';import assert from'node:assert/strict';
import{Game}from'../../dist/preview/engine.js';import{Game as Before}from'../../dist/preview/reference-0.3-engine.js';
import{makeFlowComparison,stepFlowComparison,flowState,FLOW_SCENES}from'../../dist/preview/flow-fixtures.js';
function causal(Class,type,airborne){const g=new Class({width:24,height:24,seed:711}),x=10,y=10;g.state='playing';g.connectionEnabled=false;g.spawnDelay=1e9;
 const add=(x,y,c,m=42)=>{const i=y*24+x;g.grid[i]=c;g.material[i]=m;g.added++;};
 for(let yy=12;yy<24;yy++)for(let xx=0;xx<24;xx++)add(xx,yy,2);add(x,11,2);add(x,y,1,type==='diagonal'?43:42);g.rigid[y*24+x-1]=1;g.rigid[(y+1)*24+x-1]=1;if(type!=='diagonal')g.rigid[(y+1)*24+x+1]=1;if(airborne)add(x+(type==='diagonal'?4:type==='far'?3:0),2,3);g.wakeAll();g.sandStep();return [...g.grid].flatMap((c,i)=>c===1?[[i%24,(i/24)|0]]:[]);
}
test('Non-contact airborne grains no longer alter the three local slope/roll decisions',()=>{for(const type of['diagonal','far','overhead']){assert.notDeepEqual(causal(Before,type,false),causal(Before,type,true));assert.deepEqual(causal(Game,type,false),causal(Game,type,true));}});
test('Release is bounded and grain-local, preserving mass and piece RNG while reducing coherent burst',()=>{
 const g=new Game({seed:711});g.start();g.hardDrop();assert.equal(g.count(),2304);let left=0,right=0;for(let i=0;i<g.size;i++)if(g.grid[i]){assert(Math.abs(g.vx[i])<=4);assert.equal(g.energy[i],8);left+=g.vx[i]<0;right+=g.vx[i]>0;}assert(left>500&&right>500);
 const a=new Game({seed:711}),b=new Before({seed:711});for(let i=0;i<30;i++){assert.deepEqual(a.randomPiece(),b.randomPiece());for(let n=0;n<50;n++)a.physicsRng.next();}
});
test('Five controlled scenes have equal initial geometry/material and conserve all injected or cleared grains',()=>{
 for(const key of Object.keys(FLOW_SCENES)){
  const p=makeFlowComparison(key);assert.equal(p.baseline,'0.4-r3');assert.deepEqual(p.before.grid,p.after.grid);assert.deepEqual(p.before.material,p.after.material);assert.deepEqual(p.before.rigid,p.after.rigid);assert.equal(p.before.added,p.after.added);
  while(!p.finished){stepFlowComparison(p);if(p.tick%60===0){const s=flowState(p);assert(s.before.conserved&&s.after.conserved);assert.equal(p.before.added,p.after.added);}}
  const s=flowState(p);assert.deepEqual(p.before.grid,p.after.grid);assert.deepEqual(p.before.material,p.after.material);assert.equal(p.before.physicsRng.state,p.after.physicsRng.state);assert(s.before.conserved&&s.after.conserved);assert.equal(s.before.activeChunks,0,key+' baseline sleep');assert.equal(s.after.activeChunks,0,key+' candidate sleep');
  if(key==='pour')assert.equal(s.equalEmitterCount,4320);
  if(key==='collapse'){assert.equal(s.before.removed,8640);assert.equal(s.after.removed,8640);assert.equal(s.before.score,1060);assert.equal(s.after.score,1060);}
  const grid=p.after.grid.slice();for(let i=0;i<120;i++)p.after.step();assert.deepEqual(p.after.grid,grid,key+' stable after sleep');
 }
});
test('The continuous emitter updates column caches at injection and has a fixed deterministic sequence',()=>{
 const a=makeFlowComparison('pour'),b=makeFlowComparison('pour');for(let i=0;i<120;i++){stepFlowComparison(a);stepFlowComparison(b);assert.equal(a.before.added,a.after.added);}assert.deepEqual(a.after.grid,b.after.grid);assert.deepEqual(a.after.material,b.after.material);
 for(const g of[a.before,a.after])for(let x=0;x<g.width;x++){let top=g.height;for(let y=0;y<g.height;y++)if(g.grid[y*g.width+x]){top=y;break;}assert.equal(g.surface[x],top);}
});
