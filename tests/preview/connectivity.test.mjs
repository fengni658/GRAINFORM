import test from'node:test';import assert from'node:assert/strict';
import{Game,RNG,CONNECTIVITY,AREA_SCALE}from'../../dist/preview/engine.js';
function world(w=16,h=12){const g=new Game({width:w,height:h});g.state='playing';g.active=null;g.spawnDelay=1e6;return g;}
function put(g,x,y,color=2){const i=y*g.width+x;if(!g.grid[i])g.added++;g.grid[i]=color;g.material[i]=45;g.sleep[i]=255;return i;}
function seal(g){g.rebuildSurface();g.dirty=true;g.gridVersion++;return g;}
function hinge(){const g=world();for(let y=6;y<=8;y++)for(let x=0;x<=7;x++)put(g,x,y);for(let y=3;y<=5;y++)for(let x=8;x<16;x++)put(g,x,y);put(g,8,6,1);put(g,3,0,2);return seal(g);}
function oracle(g){
  const seen=new Set(),result=[];let regions=0;
  for(let start=0;start<g.size;start++){
    const color=g.grid[start];if(!color||seen.has(start))continue;
    const stack=[start],cells=[];seen.add(start);let left=false,right=false;
    while(stack.length){const i=stack.pop(),x=i%g.width,y=Math.floor(i/g.width);cells.push(i);left||=x===0;right||=x===g.width-1;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(nx<0||nx>=g.width||ny<0||ny>=g.height)continue;
        const n=ny*g.width+nx;if(g.grid[n]===color&&!seen.has(n)){seen.add(n);stack.push(n);}
      }
    }
    if(left&&right){regions++;result.push(...cells);}
  }
  return{regions,cells:result.sort((a,b)=>a-b)};
}
test('0.2.1 diagonal-only thin hinge joins the two wall-spanning cyan masses',()=>{
 assert.equal(CONNECTIVITY,8);const g=hinge();assert.equal(g.grid[5*16+7],0);assert.equal(g.grid[6*16+8],1);
 assert.deepEqual(g.findConnections(),{count:48,regions:1});assert.equal(g.clearMask[0*16+3],0,'disconnected same-color island remains');assert.equal(g.clearMask[6*16+8],0,'adjacent other color remains');
});
test('Single-grain orthogonal and both diagonal orientations are valid, even fully asleep',()=>{
 for(const direction of['horizontal','down','up']){const g=world(12,12);for(let x=0;x<12;x++)put(g,x,direction==='horizontal'?5:direction==='down'?x:11-x);seal(g);assert(g.sleep.every((s,i)=>!g.grid[i]||s===255));assert.deepEqual(g.findConnections(),{count:12,regions:1},direction);}
});
test('A real one-cell empty gap or a wrong-color grain never acts as a bridge',()=>{
 for(const diagonal of[false,true])for(const middle of[0,1]){const g=world(13,13);for(let x=0;x<13;x++)if(x!==6)put(g,x,diagonal?x:6);if(middle)put(g,6,6,middle);seal(g);const before=g.grid.slice();assert.deepEqual(g.findConnections(),{count:0,regions:0});assert.deepEqual(g.grid,before,'detection must not fill or recolor a gap');}
});
test('Both walls must belong to the same same-color component; top-bottom span is insufficient',()=>{
 for(const kind of['left','right','interior','vertical','separate','mixed-walls']){
  const g=world(12,12);
  if(kind==='vertical')for(let y=0;y<12;y++)put(g,5,y);
  else if(kind==='separate'){for(let x=0;x<5;x++)put(g,x,2);for(let x=7;x<12;x++)put(g,x,8);}
  else if(kind==='mixed-walls'){for(let x=0;x<6;x++)put(g,x,5,1);for(let x=6;x<12;x++)put(g,x,5,2);}
  else for(let x=kind==='left'?0:1;x<(kind==='right'?12:11);x++)put(g,x,5);
  seal(g);assert.deepEqual(g.findConnections(),{count:0,regions:0},kind);
 }
});
test('Diagonal neighbors do not wrap across row edges or grid corners',()=>{
 const g=world(6,4);put(g,5,0);put(g,0,1);put(g,5,2);put(g,0,3);seal(g);assert.deepEqual(g.findConnections(),{count:0,regions:0});
});
test('Only the connected eligible region is cleared; score, normalized area, chain and mass remain exact',()=>{
 const g=hinge(),before=g.count();g.beginClear();assert.equal(g.clearTimer,12);assert.equal(g.clearCount,48);assert.equal(g.clearRegions,1);
 for(let i=0;i<12;i++)g.step();assert.equal(g.count(),2);assert.equal(g.grid[3],2);assert.equal(g.grid[6*16+8],1);assert.equal(g.removed,48);assert.equal(g.count(),g.added-g.removed);assert.equal(g.added,before);
 assert.equal(g.score,Math.round(48/AREA_SCALE+100));assert.equal(g.rawCleared,48);assert.equal(g.cleared,Math.floor(48/AREA_SCALE));assert.equal(g.lines,1);
 for(let x=0;x<16;x++)put(g,x,10,3);seal(g);const score=g.score;g.beginClear();assert.equal(g.chain,2);for(let i=0;i<12;i++)g.step();assert.equal(g.score-score,Math.round((16/AREA_SCALE+100)*2));assert.equal(g.maxChain,2);assert.equal(g.count(),2);assert.equal(g.count(),g.added-g.removed);
});
test('Persistent sleeping narrow span uses the existing ten-tick scan and pause cannot consume it',()=>{
 const g=hinge();g.pause();for(let i=0;i<20;i++)g.step();assert.equal(g.tick,0);assert.equal(g.clearTimer,0);g.resume();for(let i=0;i<9;i++)g.step();assert.equal(g.clearTimer,0);g.step();assert.equal(g.clearTimer,12);assert.equal(g.clearCount,48);
});
test('Independent eight-neighbor DFS oracle matches exhaustive binary and random multicolor fields',()=>{
 const check=g=>{const want=oracle(g);g.findConnections();assert.equal(g.clearRegions,want.regions);assert.deepEqual([...g.clearCells.slice(0,g.clearCount)].sort((a,b)=>a-b),want.cells);assert.equal(g.clearMask.reduce((n,v)=>n+v,0),want.cells.length);};
 for(let mask=0;mask<512;mask++){const g=world(3,3);for(let i=0;i<9;i++)if(mask&(1<<i))put(g,i%3,Math.floor(i/3));check(g);}
 const rng=new RNG(20261006);for(let trial=0;trial<1000;trial++){const g=world(1+rng.int(24),1+rng.int(24));for(let i=0;i<g.size;i++)g.grid[i]=rng.int(4);if(trial%20===0)g.stamp=0xfffffffe;check(g);check(g);}
});
