// Read-only product probe: seed 412, start and natural Game.step() only.
// No Canvas or inputs. Real K4 composite protocol acknowledges only a final pose.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const candidate=pathToFileURL(path.resolve(process.env.CANDIDATE??'grain059-local-roll-study/candidate')+'/');
const output=path.resolve(process.env.OUTPUT??'grain059-local-roll-study/evidence/auto-new.json');
const {Game,PER_PIECE}=await import(new URL('game.mjs',candidate));
const {CFG}=await import(new URL('ca-world.mjs',candidate));
const {FIELD_WIDTH,FIELD_HEIGHT,GRAIN_PITCH}=await import(new URL('board-geometry.mjs',candidate));
const {CompositeBuilder,CompositeQueue}=await import(new URL('composite-protocol.mjs',candidate));
const {COLOR_NAMES}=await import(new URL('grain-palette.mjs',candidate));

const game=new Game({seed:412});
const limit={pieces:40,controlTicks:25000,settlingDisplayTicks:1500};
const maxFramePoints=69*FIELD_WIDTH*FIELD_HEIGHT;
const builder=new CompositeBuilder({epoch:1,maxFramePoints,softPoints:262144,hardPoints:maxFramePoints*2});
const queue=new CompositeQueue(1),announced=new Map();
let announcedBurst=0,raf=0,lastEvent=0,stop='unknown',current=null,burst=null;
const pieces=[],bursts=[],clears=[],out=[];
let ackCount=0,endpointChecks=0,maxDuplicateRun=0,maxNoMovePendingRun=0;
const emit=data=>{out.push(data);console.log(JSON.stringify(data));};
const digest=()=>createHash('sha256').update(new Uint8Array(game.world.grid.buffer)).digest('hex');
function census(){
 const w=game.world,heights=new Int16Array(FIELD_WIDTH),colors={};let top=FIELD_HEIGHT,occupied=0;
 for(let i=0;i<w.n;i++)if(w.live[i]){top=Math.min(top,w.y[i]);heights[w.x[i]]=Math.max(heights[w.x[i]],FIELD_HEIGHT-w.y[i]);colors[w.color[i]]=(colors[w.color[i]]??0)+1;assert.equal(w.grid[w.y[i]*FIELD_WIDTH+w.x[i]],i+1);}
 for(const v of w.grid)occupied+=v!==0;
 assert.equal(occupied,w.count);assert.equal(w.count,game.added-game.rawCleared);
 return {count:w.count,active:w.active.size,chunks:w.chunks.size,height:FIELD_HEIGHT-top,topY:top,centerHeight:Math.max(...heights.slice(45,63)),edgeHeights:[heights[0],heights.at(-1)],occupiedAreaCells:occupied,occupiedWorldArea:occupied*GRAIN_PITCH**2,mass:w.count*CFG.massPerCell,colors};
}
function present(groups){
 for(const g of groups){
  assert(queue.accept(g,raf),'production queue rejected group');
  raf+=g.durationMs;
  const drawn=queue.draw(raf);assert(drawn?.final,'group endpoint not final');
  for(const [id,[x,y]] of drawn.pose){const s=game.world.resolveSlot(id);assert(s>=0);assert.equal(x,game.world.x[s]+.5);assert.equal(y,game.world.y[s]+.5);endpointChecks++;}
  assert(builder.ack(drawn.ack,{game}),'production builder rejected final ACK');ackCount++;
 }
}
function recordMaterial(){
 const f=game.frame(),material=f.materialFrame,patch=f.bodyPatch;
 const births=[];
 if(announcedBurst!==game.settlingBurst){
  const starts=new Map(material.paths.map(p=>[p.id,p.points]));
  for(const b of game.world.cache.values())if(announced.get(b.id%game.world.live.length)!==b.id){const p=starts.get(b.id);births.push({id:b.id,x:p?p[0]:b.x,y:p?p[1]:b.y});}
 }
 present(builder.accept(material,{quiet:!game.world.chunks.size,burst:game.settlingBurst,pieceId:game.pieceId,revision:game.world.revision,controlTick:game.gameTick,removedIds:patch.removed,births}));
 for(const b of births)announced.set(b.id%game.world.live.length,b.id);announcedBurst=game.settlingBurst;
}
game.start();
while(game.state==='playing'&&game.gameTick<limit.controlTicks){
 assert(builder.canStep(),'unexpected unpresented backpressure');
 const previousPhase=game.phase,previousToken=game.presentationToken;
 let clearing=null;
 if(game.phase==='flash'&&game.clearTicks===1){const colors={};for(const id of game.pendingClear.flat()){const slot=game.world.resolveSlot(id);assert(slot>=0);colors[game.world.color[slot]]=(colors[game.world.color[slot]]??0)+1;}clearing=colors;}
 game.step();
 for(const e of game.events.filter(e=>e.id>lastEvent)){
  lastEvent=e.id;
  if(e.type==='land'){
   assert.equal(e.count,PER_PIECE);
   current={piece:game.pieces,pieceId:game.pieceId,color:e.color,colorName:COLOR_NAMES[e.color],contactTick:game.gameTick,contactPhysicsTick:game.world.tick,contactPose:e.contactPose,contact:census(),settledTick:null,bursts:[],clears:[]};pieces.push(current);
   emit({type:'contact',...current});
  }
  if(e.type==='clear'){
   const row={tick:game.gameTick,physicsTick:game.world.tick,piece:game.pieces,count:e.count,regions:e.regions,chain:e.chain,colors:clearing,after:census()};clears.push(row);current?.clears.push(row);emit({type:'clear',...row});
  }
  if(e.type==='phase'&&e.phase==='settling'){
   burst={piece:game.pieces,burst:game.settlingBurst,startTick:game.gameTick,startToken:game.presentationToken,startPhysicsTick:game.world.tick,displayTicks:0,duplicateRun:0,maxDuplicateRun:0,noMovePendingRun:0,maxNoMovePendingRun:0,movingFrames:0,lastHash:digest(),lastMoveControlTick:null,settledTick:null};bursts.push(burst);current?.bursts.push(burst.burst);
  }
 }
 if(game.presentationToken>previousToken){
  recordMaterial();assert(burst);
  burst.displayTicks++;
  const hash=digest(),moves=game.world.frameLast.moves,pending=game.world.last.pending;
  if(hash===burst.lastHash){burst.duplicateRun++;}else{burst.duplicateRun=0;}
  burst.maxDuplicateRun=Math.max(burst.maxDuplicateRun,burst.duplicateRun);maxDuplicateRun=Math.max(maxDuplicateRun,burst.maxDuplicateRun);burst.lastHash=hash;
  if(!moves&&pending){burst.noMovePendingRun++;}else{burst.noMovePendingRun=0;}
  burst.maxNoMovePendingRun=Math.max(burst.maxNoMovePendingRun,burst.noMovePendingRun);maxNoMovePendingRun=Math.max(maxNoMovePendingRun,burst.maxNoMovePendingRun);
  if(moves){burst.movingFrames++;burst.lastMoveControlTick=game.gameTick;}
  if(game.world.ready()){
   burst.settledTick=game.gameTick;burst.settledPhysicsTick=game.world.tick;burst.final=census();
   current.settledTick=game.gameTick;current.settled=burst.final;
   emit({type:'settled',piece:game.pieces,burst:burst.burst,tick:game.gameTick,physicsTick:game.world.tick,displayTicks:burst.displayTicks,maxDuplicateRun:burst.maxDuplicateRun,maxNoMovePendingRun:burst.maxNoMovePendingRun,presentedToken:game.presentedToken,presentationToken:game.presentationToken,...burst.final});
  }
  if(burst.displayTicks>limit.settlingDisplayTicks&&!game.world.ready()){stop='settling-display-limit-counterexample';break;}
 }
 if(previousPhase==='settling'&&game.phase==='falling')assert(!game.awaitingPresentation,'spawn before final ACK');
 if(game.pieces>=limit.pieces&&game.phase==='falling'){stop='piece-limit';break;}
}
if(game.state==='over')stop='game-over';else if(game.gameTick>=limit.controlTicks)stop='control-tick-limit';
const summary={metrics:{...game.world.metrics},seed:412,limits:limit,stop,state:game.state,phase:game.phase,gameOverReason:game.gameOverReason,pieces:game.pieces,pieceId:game.pieceId,controlTicks:game.gameTick,controlSeconds:game.gameTick/60,physicsTicks:game.world.tick,materialDisplayTicks:game.presentationToken,presentedToken:game.presentedToken,ackCount,endpointChecks,rawCleared:game.rawCleared,clearEvents:clears.length,lines:game.lines,added:game.added,score:game.score,level:game.level,maxSettlingDisplayTicks:Math.max(0,...bursts.map(b=>b.displayTicks)),maxDuplicateRun,maxNoMovePendingRun,finalPending:game.world.last.pending,framePending:game.world.framePending,awaitingPresentation:game.awaitingPresentation,noMoveSweeps:game.world.noMoveSweeps,lastMoveTick:game.world.lastMoveTick,presentedTick:game.world.presentedTick,builderPending:builder.pending.length,builderBuilding:builder.building.length,final:census(),limitations:'Fixed seed only; ideal immediate delivery of real K4 final endpoint ACK, no Canvas or transport scheduler; bounded observation is not proof of infinite behavior.'};
emit({type:'summary',...summary});
writeFileSync(output,JSON.stringify({summary,pieces,bursts,clears},null,2)+'\n');
