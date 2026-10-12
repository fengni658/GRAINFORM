// Bounded, renderer-free causal trace. No production files are modified.
// Run: node grain059-flow-incident/tests/local-roll-trace.mjs [baseline-dir] [candidate-dir]
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const root=path.resolve(new URL('../../',import.meta.url).pathname);
const output=path.dirname(new URL(import.meta.url).pathname);
const directories={baseline:path.resolve(process.argv[2]||path.join(root,'grain059-candidate/candidate')),candidate:path.resolve(process.argv[3]||path.join(root,'grain059-local-roll-study/candidate'))};
const source={};
for(const [name,dir] of Object.entries(directories))source[name]={...await import(pathToFileURL(path.join(dir,'ca-world.mjs'))),...await import(pathToFileURL(path.join(dir,'ca-frame-world.mjs')))};

function fixture(n){
  const points=Array.from({length:n},(_,k)=>({x:30+k,y:192-n-2+k}));
  for(let x=29;x<=30+n;x++)for(let y=192-n-1+x-30;y<192;y++)points.push({x,y});
  return {name:`stair-${n}`,excessIds:Array.from({length:n},(_,i)=>i),seed:0x842199,color:1,batch:1,initialVy:0,points};
}
function assertGrid(w,initial){
  assert.equal(w.count,initial,'grain count');
  let live=0,occupied=0;const identities=new Set();
  for(let i=0;i<w.n;i++)if(w.live[i]){live++;assert.equal(w.grid[w.cell(w.x[i],w.y[i])],i+1,'slot/grid bijection');assert(!identities.has(w.identity[i]),'identity uniqueness');identities.add(w.identity[i]);}
  for(const v of w.grid)if(v)occupied++;
  assert.equal(live,initial);assert.equal(occupied,initial);
}
function potential(w,i){
  const x=w.x[i],y=w.y[i],support=y+1<192?w.grid[w.cell(x,y+1)]-1:-1;
  return w.empty(x,y+1)||(support>=0&&w.vy[support]>0)||[-1,1].some(dx=>w.empty(x+dx,y)&&w.empty(x+dx,y+1));
}
function assertAwake(w){
  let count=0;for(let i=0;i<w.n;i++)if(w.live[i]&&potential(w,i)){count++;assert(w.chunks.has(w.chunk(w.x[i],w.y[i])),'geometrically mobile grain in sleeping chunk');}
  if(count)assert.equal(w.ready(),false,'ready before mobile grains finish');
  return count;
}
function assertPaths(w,frame){
  // All actual phases are axis-aligned. Sampling endpoints and midpoints with
  // local buckets checks unit-center separation, without a dense pair matrix.
  const phases=frame?68:17;let samples=0,minDistanceSquared=Infinity;
  for(let phase=0;phase<=phases;phase+=.5){const bins=new Map();for(let i=0;i<w.n;i++)if(w.live[i]){const id=w.identity[i],[x,y]=w.positionAt(id,phase/phases),bx=Math.floor(x),by=Math.floor(y);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)for(const q of bins.get(`${bx+dx},${by+dy}`)||[]){const d=(x-q.x)**2+(y-q.y)**2;minDistanceSquared=Math.min(minDistanceSquared,d);assert(d>=1-1e-9,`overlapping paths at phase ${phase}: ${id}/${q.id}`);}
    const key=`${bx},${by}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push({id,x,y});samples++;
  }}return{samples,minDistanceSquared};
}
function positions(w,n){return Array.from({length:n},(_,id)=>({id,x:w.x[id],y:w.y[id]}));}
function run(name,n,frame){
  const {World,FrameWorld,slideCohort}=source[name],f=fixture(n),w=frame?new FrameWorld():new World();w.seed=f.seed;w.admit(f.points,f.color,f.batch,f.initialVy);
  const initial={count:w.count,tick:w.tick,frame:w.frame??null,chunks:[...w.chunks],metrics:{...w.metrics},positions:positions(w,n)};
  const initialCandidates=f.excessIds.map(id=>({id,cohort:slideCohort(id),eligible:(1+slideCohort(id))%5!==0,left:w.direction(id,-1,false),right:w.direction(id,1,false)}));
  Object.assign(w.metrics,initial.metrics);
  const audit=[];w.audit=(id,ox,oy,x,y,phase)=>{assertGrid(w,f.points.length);audit.push({tick:w.tick,id,from:[ox,oy],to:[x,y],phase,excess:id<n});};
  const states=[];
  for(let step=0;step<(frame?2:1);step++){
    const begin=audit.length;if(frame)w.stepFrame();else w.step();assertGrid(w,f.points.length);const mobile=assertAwake(w),paths=assertPaths(w,frame),endPositions=positions(w,n),moves=audit.slice(begin),excessRolls=moves.filter(m=>m.excess&&m.from[0]!==m.to[0]);
    const firstRolls=Array.from({length:n},(_,id)=>{const m=excessRolls.find(m=>m.id===id);return m?{id,tick:m.tick,phase:m.phase,framePhase:frame?(m.tick-(step*4+1))*17+m.phase:m.phase}:null;}).filter(Boolean);
    const old=step?states[step-1].positions:initial.positions,displacements=endPositions.map((p,id)=>({id,dx:p.x-old[id].x,dy:p.y-old[id].y}));
    const groups={};for(const d of displacements){const key=`${d.dx},${d.dy}`;(groups[key]??=[]).push(d.id);}
    states.push({step:step+1,tick:w.tick,frame:w.frame??null,last:{...w.last},frameLast:w.frameLast?{...w.frameLast}:null,metrics:{...w.metrics},positions:endPositions,displacements,equalDisplacementGroups:groups,firstRolls,excessRollCount:excessRolls.length,allPathLegs:moves.length,potentialCount:mobile,activeChunks:w.chunks.size,readyBeforePresentation:w.ready(),framePending:w.framePending??null,paths,moves});
    if(moves.length)assert.equal(w.ready(),false,'ready without endpoint presentation');
    w.completePresentation();assertAwake(w);
  }
  return {name,n,mode:frame?'two-display-frames':'one-rule-step',initial,initialCandidates,states};
}
const results=[];for(let n=3;n<=9;n++)for(const name of Object.keys(source))for(const frame of [false,true])results.push(run(name,n,frame));
fs.writeFileSync(path.join(output,'local-roll-fixture-7.json'),JSON.stringify(fixture(7),null,2)+'\n');
fs.writeFileSync(path.join(output,'local-roll-trace-results.json'),JSON.stringify({directories,scope:'3–9 excess grains, one rule step and at most two independent display frames, no Canvas',checks:{grainConservation:true,gridBijection:true,pathCenterSeparation:true,noPrematureSleep:true,endpointPresentationGate:true},results},null,2)+'\n');
const concise=results.map(r=>({variant:r.name,n:r.n,mode:r.mode,initialCount:r.initial.count,round0Possible:r.initialCandidates.filter(p=>p.left||p.right).map(p=>p.id),states:r.states.map(s=>({tick:s.tick,rolls:s.excessRollCount,firstRolls:s.firstRolls,equalDisplacements:s.equalDisplacementGroups,pathLegs:s.allPathLegs,pending:s.potentialCount,ready:s.readyBeforePresentation}))}));
fs.writeFileSync(path.join(output,'local-roll-trace-summary.json'),JSON.stringify(concise,null,2)+'\n');
console.log(JSON.stringify({checks:'PASS',cases:results.length,seven:concise.filter(r=>r.n===7),output},null,2));
