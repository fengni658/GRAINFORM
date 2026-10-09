import {CAWorld,R,D,DT} from './ca-adapter.mjs';
export {R,D,DT};
export const VERSION='0.4.9',BLOCK=24,LEFT=28,RIGHT=260,FLOOR=420,PER_CELL=576,PER_PIECE=2304;
// Unchanged seven tetrominoes, rotation and seeded RNG from the legacy rules.
export const SHAPES = [
  [[0,0],[1,0],[0,1],[1,1]],
  [[0,0],[1,0],[2,0],[3,0]],
  [[1,0],[0,1],[1,1],[2,1]],
  [[0,0],[0,1],[1,1],[2,1]],
  [[2,0],[0,1],[1,1],[2,1]],
  [[1,0],[2,0],[0,1],[1,1]],
  [[0,0],[1,0],[1,1],[2,1]]
];
export function rotateShape(shape) {
  const maxY = Math.max(...shape.map(p=>p[1]));
  return shape.map(([x,y])=>[maxY-y,x]);
}
export class RNG {
  constructor(seed=1){ this.state=seed>>>0; }
  next(){ let t=this.state=(this.state+0x6d2b79f5)>>>0; t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296; }
  int(n){return Math.floor(this.next()*n);}
}

export function cellSlots(x0,y0){const out=[];for(let y=y0;y<y0+24;y++)for(let x=x0;x<x0+24;x++)out.push({x,y});return out;}
export class Game {
 constructor({seed=1}={}){this.solver='ca-path';this.World=CAWorld;this.reset(seed);}
 reset(seed=1){this.seed=seed>>>0;this.world=new this.World({seed:this.seed});this.rng=new RNG(this.seed);this.physicsRng=new RNG((this.seed^0x9e3779b9)>>>0);this.gameTick=0;this.time=0;this.rawCleared=0;this.state='ready';this.phase='ready';this.clearTicks=0;this.pieceId=0;this.gameOverReason=null;this.active=null;this.next=this.randomPiece();this.score=0;this.level=1;this.cleared=0;this.pieces=0;this.lines=0;this.chain=0;this.maxChain=0;this.added=0;this.events=[];this.eventSerial=0;this.fall=0;this.pendingClear=[];this.clearTimer=0;this.spawnDelay=0;this.lastScan=0;this.lastCounts={count:0,active:0};this.presentationToken=0;this.presentedToken=0;this.presentationTicks=new Map();this.pendingMaterialFrame=null;}
 emit(type,data={}){this.events.push({id:++this.eventSerial,type,tick:this.world.tick,controlTick:this.gameTick,physicsTick:this.world.tick,...data});if(this.events.length>32)this.events.shift();}
 randomPiece(){return {shape:SHAPES[this.rng.int(7)].map(p=>p.slice()),color:1+this.rng.int(4)};}
 start(){if(this.state==='ready'){this.state='playing';this.spawn();return true;}return false;}
 pause(){if(this.state==='playing'){this.state='paused';return true;}return false;}
 resume(){if(this.state==='paused'){this.state='playing';return true;}return false;}
 endGame(reason){this.gameOverReason=reason;this.state='over';this.phase='over';this.active=null;this.emit('over',{reason});return false;}
 setPhase(phase){if(this.phase!==phase){const previous=this.phase;this.phase=phase;this.emit('phase',{previous,phase,activeCount:this.world.active.size,bodyCount:this.world.stats().live});}}
 spawn(){if(this.world.chunks.size)throw Error('Spawn with active material');this.world.pendingInbound=1;this.setPhase('falling');this.pieceId++;const p=this.next;this.next=this.randomPiece();const wide=(1+Math.max(...p.shape.map(v=>v[0])))*BLOCK;this.active={...p,x:Math.floor((288-wide)/2),y:0};this.fall=0;if(!this.canPlace(this.active))this.endGame('top-out');}
 canPlace(p){if(!p)return false;for(const[bx,by]of p.shape){const x0=p.x+bx*24-28,y0=p.y+by*24;if(!Number.isInteger(x0)||!Number.isInteger(y0)||x0<0||x0+24>232||y0<0||y0+24>420)return false;for(let y=y0;y<y0+24;y++)for(let x=x0;x<x0+24;x++)if(this.world.grid[y*232+x])return false;}return true;}
 acceptsInput(){return this.state==='playing'&&this.phase==='falling'&&this.active&&!this.clearTimer;}
 move(dx){if(!this.acceptsInput()||!Number.isFinite(dx))return false;let moved=false,sign=Math.sign(dx);for(let i=0;i<Math.min(288,Math.abs(dx));i++){const p={...this.active,x:this.active.x+sign};if(!this.canPlace(p))break;this.active=p;moved=true;}return moved;}
 rotate(){if(!this.acceptsInput())return false;const shape=rotateShape(this.active.shape);for(const dx of[0,-BLOCK,BLOCK,-2*BLOCK,2*BLOCK]){const p={...this.active,x:this.active.x+dx,shape};if(this.canPlace(p)){this.active=p;return true;}}return false;}
 descend(pixels=1){if(!this.acceptsInput())return false;for(let i=0;i<pixels;i++){const p={...this.active,y:this.active.y+1};if(!this.canPlace(p)){this.touchDown();return false;}this.active=p;}return true;}
 softDrop(){return this.descend(12);}
 drop(){if(!this.acceptsInput())return false;let d=0;while(this.canPlace({...this.active,y:this.active.y+1})){this.active.y++;d++;}const landed=this.touchDown();if(landed)this.score+=Math.floor(d/BLOCK)*2;return landed;}
 grainPositions(p){if(!p||p.shape.length!==4||new Set(p.shape.map(v=>v.join(','))).size!==4)throw Error('Piece must have four distinct cells');return p.shape.flatMap(([bx,by])=>cellSlots(p.x+bx*24,p.y+by*24).map(q=>({...q,color:p.color})));}
 touchDown(){if(!this.active)return false;if(this.canPlace({...this.active,y:this.active.y+1}))throw Error('Landing before contact');return this.land();}
 rigidRects(){return this.active?this.active.shape.map(([bx,by])=>({x0:this.active.x+bx*BLOCK,y0:this.active.y+by*BLOCK,x1:this.active.x+(bx+1)*BLOCK,y1:this.active.y+(by+1)*BLOCK})):[];}
 land(){
  if(!this.active)return false;
  // A lower-field invariant violation is never mislabeled as top-out. Check
  // and reject atomically; the pre-contact guard must prevent this in real play.
  if(!this.canPlace(this.active))throw new Error('Atomic grid landing rejected: rigid piece already overlaps sand or bounds');
  const points=this.grainPositions(this.active),before=this.world.stats().live,result=this.world.addMany(points,{batch:this.pieceId,initialVy:480});
  if(!result.accepted){if(result.reason==='capacity'||result.reason==='occupied-slot')return this.endGame(`grid-admission-${result.reason}`);throw new Error(`Atomic grid landing rejected: ${result.reason}`);}
  if(result.addedIds.length!==PER_PIECE||this.world.stats().live-before!==PER_PIECE)throw new Error('Grain conservation failed');
  this.added+=PER_PIECE;this.pieces++;this.chain=0;this.emit('land',{count:PER_PIECE,color:this.active.color,contactPose:{x:this.active.x,y:this.active.y,shape:this.active.shape.map(p=>p.slice())}});this.active=null;this.world.pendingInbound=0;this.spawnDelay=0;this.setPhase('settling');return true;
 }
 findConnections(){return this.world.connections().spanningComponents.map(c=>[...c.ids]);}
 removeGroups(groups){const ids=[...new Set(groups.flat())],alive=ids.filter(id=>this.world.has(id));if(!alive.length)return 0;this.world.remove(alive);this.chain++;this.maxChain=Math.max(this.maxChain,this.chain);this.score+=Math.round((alive.length*64/PER_CELL+groups.length*100)*this.level*this.chain);this.rawCleared+=alive.length;this.cleared=Math.floor(this.rawCleared*64/PER_CELL);this.lines+=groups.length;this.level=Math.min(20,1+Math.floor(this.rawCleared*64/PER_CELL/1800));this.emit('clear',{count:alive.length,regions:groups.length,chain:this.chain});return alive.length;}
 _checkSettlement(){
  if(!this.world.ready())throw Error('Settlement checked before quiet and presentation');
  this.setPhase('checking');const groups=this.findConnections();
  if(groups.length){this.pendingClear=groups;this.clearTicks=12;this.clearTimer=this.clearTicks*DT;this.setPhase('flash');this.emit('clear-start',{count:groups.flat().length,phase:this.phase});}
  else{this.pendingClear=[];this.spawn();}
 }
 step(){if(this.state!=='playing')return false;this.gameTick++;this.time=this.gameTick*DT;
  if(this.phase==='flash'){
   this.clearTicks--;this.clearTimer=this.clearTicks*DT;
   if(this.clearTicks===0){this.removeGroups(this.pendingClear);this.pendingClear=[];this.setPhase('settling');}
   return true;
  }
  if(this.phase==='settling'){
   if(this.world.chunks.size){this.world.step();const token=++this.presentationToken;this.presentationTicks.set(token,this.world.tick);this.pendingMaterialFrame={token,ruleTick:this.world.tick,phases:68,durationMs:1000/60,paths:this.world.materialPaths()};}
   if(this.world.ready())this._checkSettlement();return true;
  }
  if(this.phase!=='falling'||!this.active)throw Error('Invalid live phase');
  const speed=180*Math.min(1.45,.24+(this.level-1)*.065+Math.min(.4,this.pieces*.002));this.fall+=speed*DT;while(this.fall>=1&&this.active){this.fall-=1;if(!this.descend(1))break;}return true;
 }
 completePresentation(token){if(!Number.isInteger(token)||token!==this.presentedToken+1||!this.presentationTicks.has(token))return false;this.presentedToken=token;this.world.presentedTick=this.presentationTicks.get(token);for(const key of this.presentationTicks.keys())if(key<=token)this.presentationTicks.delete(key);if(token===this.presentationToken)this.world.framePending=false;return true;}
 get awaitingPresentation(){return this.presentationToken>this.presentedToken}
 snapshot({includeBodies=true}={}){const result={version:VERSION,phase:this.phase,clearTicks:this.clearTicks,pieceId:this.pieceId,modelKind:'multi-cell-path-ca',interpolation:'68-stage-unit-path',presentationToken:this.presentationToken,presentedToken:this.presentedToken,state:this.state,gameOverReason:this.gameOverReason,active:this.active,next:this.next,time:this.time,tick:this.gameTick,physicsTick:this.world.tick,score:this.score,level:this.level,cleared:this.cleared,rawCleared:this.rawCleared,pieces:this.pieces,lines:this.lines,chain:this.chain,maxChain:this.maxChain,added:this.added,bodyCount:this.world.stats().live,activeCount:this.world.active.size,sleepingCount:this.world.stats().sleeping,solver:this.solver,clearIds:this.pendingClear.flat(),events:this.events};if(includeBodies)result.bodies=this.world.bodies();return result;}
 frame({full=false}={}){const materialFrame=this.pendingMaterialFrame;return {...this.snapshot({includeBodies:false}),bodyPatch:this.world.consumeChanges({full}),materialFrame};}
}
