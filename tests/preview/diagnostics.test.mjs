import test from'node:test';import assert from'node:assert/strict';
import{FrameDiagnostics}from'../../dist/preview/diagnostics.js';
import{Game,SHAPES,RNG,rotateShape}from'../../dist/preview/engine.js';
import{Game as Reference}from'../fixtures/fine-p3-reference.mjs';
test('Leading-edge movement is identical through gaps, invalid starts and every tetromino rotation',()=>{
  const rng=new RNG(71281);
  for(let trial=0;trial<120;trial++){
    const a=new Reference({seed:trial}),b=new Game({seed:trial});a.start();b.start();
    for(let i=0;i<a.size;i++)if(rng.int(61)===0){a.grid[i]=b.grid[i]=1;a.added++;b.added++;}
    for(const g of[a,b]){g.active.shape=SHAPES[trial%7].map(p=>[...p]);for(let r=0;r<(trial/7|0)%4;r++)g.active.shape=rotateShape(g.active.shape);g.active.x=trial%180;g.active.y=trial%200;if(trial%2===0)for(const[bx,by]of g.active.shape)for(let y=g.active.y+by*24;y<g.active.y+(by+1)*24;y++)for(let x=g.active.x+bx*24;x<g.active.x+(bx+1)*24;x++)g.grid[y*g.width+x]=0;}
    for(const command of[['move',80],['move',-100],['nudgeDown',15],['rotate'],['move',31],['hardDrop']]){
      const[fn,n]=command;const run=g=>{try{return{result:g[fn](n)};}catch(e){return{error:e.message};}};assert.deepEqual(run(b),run(a),`${trial} ${fn}`);assert.deepEqual(b.active,a.active);assert.deepEqual(b.grid,a.grid);assert.equal(b.score,a.score);assert.equal(b.physicsRng.state,a.physicsRng.state);
    }
  }
});
test('Diagnostics preserve previous-frame causal context and bounded complete-session maxima',()=>{
  let now=0;const d=new FrameDiagnostics({clock:()=>++now}),g={sandStep(){return 7;},findConnections(){return 2;},finishClear(){},lock(){}};d.instrument(g);assert.equal(g.sandStep(),7);
  d.inputAction('drop',10,8);
  d.recordFrame({now:20,begin:21,gap:17,work:4,playing:true,steps:1,phases:{simulation:2,render:1}});
  d.recordFrame({now:120,begin:121,gap:100,work:3,playing:true,steps:6,phases:{simulation:2,render:1}});
  for(let i=0;i<50;i++){d.inputAction('left',130+i,.2);d.recordFrame({now:140+i*17,begin:140+i*17,gap:17,work:1,playing:true,steps:1,phases:{simulation:.8,render:.1}});}
  const s=d.snapshot();assert.equal(s.longestFrameGaps[0].gapMs,100);assert.equal(s.longestFrameGaps[0].previousFrame.workMs,4);assert.equal(s.inputActions.count,51);assert.equal(s.inputActions.maxMs,8);assert.equal(s.inputActions.slowest.length,6);assert.equal(s.slowestWorkFrames.length,6);assert.equal(s.phases.simulation.count,52);assert.equal(s.nestedEngineMethods.sandStep.count,1);
});
