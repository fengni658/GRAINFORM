import fs from 'node:fs';import crypto from 'node:crypto';import path from 'node:path';
import {Game} from '../game.mjs';import {auditCircles} from '../grid-world.mjs';
const out=path.resolve(process.argv[2]||new URL('../evidence-grid/',import.meta.url).pathname);fs.mkdirSync(out,{recursive:true});
const moves=[-100,65,-25,100,-100,30],hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const summaries=[];
for(const [name,requestedDrops,totalTicks]of[['six-blocks',6,960],['dense-eighteen-blocks',18,2160]]){
 const g=new Game({seed:1});g.start();const times=[],inputs=[],audits=[];const begin=performance.now();
 for(let t=0;t<totalTicks;t++){
  if(g.state!=='playing')throw Error(`${name}: game stopped ${g.state}`);
  if(t%120===0&&inputs.length<requestedDrops){if(!g.active)throw Error('Expected next piece');const k=inputs.length,rotate=!!(k%2);g.move(moves[k%6]);if(rotate)g.rotate();inputs.push({tick:g.gameTick,move:moves[k%6],rotate,color:g.active.color,shape:g.active.shape,x:g.active.x,y:g.active.y});g.drop();}
  const ts=performance.now();g.step();times.push(performance.now()-ts);
  if(g.world.stats().live+g.rawCleared!==g.added)throw Error('Conservation');
  if(t%120===119){const a=auditCircles(g.world.bodies());if(!a.passed)throw Error('Geometry');audits.push({tick:g.gameTick,...a});}
 }
 const snapshot=g.snapshot(),particles=g.world.snapshot().particles,sorted=[...times].sort((a,b)=>a-b),stateHash=hash({game:snapshot,particles});
 const summary={name,scope:'Actual game move/rotate/drop/fixed-step inputs; Node throughput only, not browser FPS',requestedDrops,inputs,actualPieces:g.pieces,added:g.added,rawCleared:g.rawCleared,live:snapshot.bodyCount,active:snapshot.activeCount,gameTick:g.gameTick,state:g.state,stateHash,audits,timing:{firstStepMs:times[0],meanStepMs:times.reduce((a,b)=>a+b,0)/times.length,p95Ms:sorted[Math.ceil(sorted.length*.95)-1],p99Ms:sorted[Math.ceil(sorted.length*.99)-1],maxMs:sorted.at(-1),totalObservedWallMs:performance.now()-begin,simulatedSeconds:g.time}};
 fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify({summary,snapshot,particles},null,2));summaries.push(summary);
}
const sourceHashes=Object.fromEntries(['game.mjs','grid-world.mjs','local-sand.mjs'].map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(new URL('../'+n,import.meta.url))).digest('hex')]));fs.writeFileSync(path.join(out,'replay-summary.json'),JSON.stringify({sourceHashes,summaries},null,2));console.log(JSON.stringify(summaries.map(({name,actualPieces,added,live,active,stateHash,timing})=>({name,actualPieces,added,live,active,stateHash,timing})),null,2));
