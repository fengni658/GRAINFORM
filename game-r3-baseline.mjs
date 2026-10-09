import {GridWorld,R,D,DT,SAND_CONTRACT,slotPosition,rowColumns} from './baseline-world.mjs';
export {R,D,DT};
export const VERSION='0.4.8',BLOCK=24,LEFT=28,RIGHT=260,FLOOR=420,PER_CELL=169,PER_PIECE=676;
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

/** All global triangular slots whose entire physical circle lies in this cell. */
export function cellSlots(x0,y0,maxRows=SAND_CONTRACT.defaultMaxRows){
 const x1=x0+BLOCK,y1=y0+BLOCK,c=SAND_CONTRACT,out=[];
 if(!Number.isFinite(x0)||!Number.isFinite(y0)||x0<LEFT||x1>RIGHT||y0<0||y1>FLOOR)return out;
 const minRow=Math.max(0,Math.ceil((FLOOR-R-(y1-R))/c.rowHeight-1e-10)),maxRow=Math.min(maxRows-1,Math.floor((FLOOR-R-(y0+R))/c.rowHeight+1e-10));
 for(let row=minRow;row<=maxRow;row++){const shift=(row&1)*.5,minCol=Math.max(0,Math.ceil((x0+R-LEFT-R)/c.spacing-shift-1e-10)),maxCol=Math.min(rowColumns(row)-1,Math.floor((x1-R-LEFT-R)/c.spacing-shift+1e-10));for(let col=minCol;col<=maxCol;col++){const point=slotPosition(row,col);if(point.x-R>=x0-1e-9&&point.x+R<=x1+1e-9&&point.y-R>=y0-1e-9&&point.y+R<=y1+1e-9)out.push({row,col,...point});}}
 return out;
}
export class Game {
 constructor({seed=1}={}){this.solver='grid';this.World=GridWorld;this.reset(seed);}
 reset(seed=1){this.seed=seed>>>0;this.world=new this.World({seed:this.seed});this.rng=new RNG(this.seed);this.physicsRng=new RNG((this.seed^0x9e3779b9)>>>0);this.gameTick=0;this.time=0;this.rawCleared=0;this.state='ready';this.gameOverReason=null;this.active=null;this.next=this.randomPiece();this.score=0;this.level=1;this.cleared=0;this.pieces=0;this.lines=0;this.chain=0;this.maxChain=0;this.added=0;this.events=[];this.eventSerial=0;this.fall=0;this.pendingClear=[];this.clearTimer=0;this.spawnDelay=0;this.lastScan=0;this.lastCounts={count:0,active:0};}
 emit(type,data={}){this.events.push({id:++this.eventSerial,type,tick:this.world.tick,...data});if(this.events.length>32)this.events.shift();}
 randomPiece(){return {shape:SHAPES[this.rng.int(7)].map(p=>p.slice()),color:1+this.rng.int(4)};}
 start(){if(this.state==='ready'){this.state='playing';this.spawn();return true;}return false;}
 pause(){if(this.state==='playing'){this.state='paused';return true;}return false;}
 resume(){if(this.state==='paused'){this.state='playing';return true;}return false;}
 endGame(reason){this.gameOverReason=reason;this.state='over';this.active=null;this.emit('over',{reason});return false;}
 spawn(){const p=this.next;this.next=this.randomPiece();const wide=(1+Math.max(...p.shape.map(v=>v[0])))*BLOCK;this.active={...p,x:Math.floor((288-wide)/2),y:0};this.fall=0;if(!this.canPlace(this.active))this.endGame('top-out');}
 canPlace(p){if(!p)return false;for(const[bx,by]of p.shape){const x0=p.x+bx*BLOCK,y0=p.y+by*BLOCK,x1=x0+BLOCK,y1=y0+BLOCK;if(x0<LEFT||x1>RIGHT||y0<0||y1>FLOOR)return false;for(const b of this.world.near((x0+x1)/2,(y0+y1)/2,BLOCK/2+R)){const nx=Math.max(x0,Math.min(x1,b.x)),ny=Math.max(y0,Math.min(y1,b.y));if((b.x-nx)**2+(b.y-ny)**2<(R+.0002)**2)return false;}}return true;}
 acceptsInput(){return this.state==='playing'&&this.active&&!this.clearTimer;}
 move(dx){if(!this.acceptsInput()||!Number.isFinite(dx))return false;let moved=false,sign=Math.sign(dx);for(let i=0;i<Math.min(288,Math.abs(dx));i++){const p={...this.active,x:this.active.x+sign};if(!this.canPlace(p))break;this.active=p;moved=true;}return moved;}
 rotate(){if(!this.acceptsInput())return false;const shape=rotateShape(this.active.shape);for(const dx of[0,-BLOCK,BLOCK,-2*BLOCK,2*BLOCK]){const p={...this.active,x:this.active.x+dx,shape};if(this.canPlace(p)){this.active=p;return true;}}return false;}
 descend(pixels=1){if(!this.acceptsInput())return false;for(let i=0;i<pixels;i++){const p={...this.active,y:this.active.y+1};if(!this.canPlace(p)){this.touchDown();return false;}this.active=p;}return true;}
 softDrop(){return this.descend(12);}
 drop(){if(!this.acceptsInput())return false;let d=0;while(this.canPlace({...this.active,y:this.active.y+1})){this.active.y++;d++;}const landed=this.touchDown();if(landed)this.score+=Math.floor(d/BLOCK)*2;return landed;}
 grainPositions(p){
  if(!p||!Array.isArray(p.shape)||p.shape.length!==4||new Set(p.shape.map(v=>v.join(','))).size!==4)throw new Error('Piece must have four distinct cells');
  const points=[];
  for(const [bx,by]of p.shape){const candidates=cellSlots(p.x+bx*BLOCK,p.y+by*BLOCK,this.world.maxRows);if(candidates.length<PER_CELL)throw new Error(`Insufficient legal grid slots: ${candidates.length} < ${PER_CELL}`);
   // Compact bottom-up admission: keep interior rows full instead of regularly
   // punching holes throughout the newborn material. Only the upper boundary
   // row may be partial; centering avoids a one-sided truncated row.
   const center=p.x+bx*BLOCK+BLOCK/2;
   candidates.sort((a,b)=>a.row-b.row||Math.abs(a.x-center)-Math.abs(b.x-center)||a.col-b.col);
   for(let i=0;i<PER_CELL;i++)points.push({...candidates[i],color:p.color});
  }
  if(new Set(points.map(p=>`${p.row},${p.col}`)).size!==PER_PIECE)throw new Error('Piece slot duplication');return points;
 }
 touchDown(){
  if(!this.active)return false;
  // Resolve the final subpixel against the same rigid bounds/circle test. No
  // proximity conversion: the legal pose must actually block its next descent.
  if(this.canPlace({...this.active,y:this.active.y+1}))throw Error('Landing before contact');
  let lo=0,hi=1;for(let i=0;i<20;i++){const mid=(lo+hi)/2;if(this.canPlace({...this.active,y:this.active.y+mid}))lo=mid;else hi=mid;}
  this.active={...this.active,y:this.active.y+lo};return this.land();
 }
 rigidRects(){return this.active?this.active.shape.map(([bx,by])=>({x0:this.active.x+bx*BLOCK,y0:this.active.y+by*BLOCK,x1:this.active.x+(bx+1)*BLOCK,y1:this.active.y+(by+1)*BLOCK})):[];}
 land(){
  if(!this.active)return false;
  // A lower-field invariant violation is never mislabeled as top-out. Check
  // and reject atomically; the pre-contact guard must prevent this in real play.
  if(!this.canPlace(this.active))throw new Error('Atomic grid landing rejected: rigid piece already overlaps sand or bounds');
  const points=this.grainPositions(this.active),before=this.world.stats().live,result=this.world.addMany(points);
  if(!result.accepted){if(result.reason==='capacity'||result.reason==='occupied-slot')return this.endGame(`grid-admission-${result.reason}`);throw new Error(`Atomic grid landing rejected: ${result.reason}`);}
  if(result.addedIds.length!==PER_PIECE||this.world.stats().live-before!==PER_PIECE)throw new Error('Grain conservation failed');
  this.added+=PER_PIECE;this.pieces++;this.chain=0;this.emit('land',{count:PER_PIECE,color:this.active.color,contactPose:{x:this.active.x,y:this.active.y,shape:this.active.shape.map(p=>p.slice())}});this.active=null;this.spawnDelay=22/60;return true;
 }
 findConnections(){return this.world.connections().spanningComponents.map(c=>[...c.ids]);}
 removeGroups(groups){const ids=[...new Set(groups.flat())],alive=ids.filter(id=>this.world.bs[id]?.alive);if(!alive.length)return 0;this.world.remove(alive);this.chain++;this.maxChain=Math.max(this.maxChain,this.chain);this.score+=Math.round((alive.length*64/PER_CELL+groups.length*100)*this.level*this.chain);this.rawCleared+=alive.length;this.cleared=Math.floor(this.rawCleared*64/PER_CELL);this.lines+=groups.length;this.level=Math.min(20,1+Math.floor(this.rawCleared*64/PER_CELL/1800));this.emit('clear',{count:alive.length,regions:groups.length,chain:this.chain});return alive.length;}
 step(){if(this.state!=='playing')return false;this.gameTick++;this.time=this.gameTick*DT;
  // Preserve legacy clear contract: highlighted identities and all physics are
  // frozen during the 0.2-second clear animation, then support removal wakes sand.
  if(this.clearTimer>0){this.clearTimer=Math.max(0,this.clearTimer-DT);if(this.clearTimer<1e-10){this.removeGroups(this.pendingClear);this.pendingClear=[];this.clearTimer=0;this.spawnDelay=18/60;}return true;}
  // Falling grains see the live rigid obstacle; they cannot force an airborne
  // piece to convert simply by approaching its side or upper surface.
  this.world.setRigidObstacle(this.rigidRects());
  try{this.world.step();}finally{this.world.setRigidObstacle([]);} 
  if(this.world.tick%16===0){const groups=this.findConnections();if(groups.length){this.pendingClear=groups;this.clearTimer=12/60;this.emit('clear-start',{count:groups.flat().length});return true;}}
  if(!this.active){this.spawnDelay-=DT;if(this.spawnDelay<=0)this.spawn();return true;}
  // Rigid blocks check every logical unit and resolve the actual contact pose.
  const speed=180*Math.min(1.45,.24+(this.level-1)*.065+Math.min(.4,this.pieces*.002));this.fall+=speed*DT;while(this.fall>=1&&this.active){this.fall-=1;if(!this.descend(1))break;}return true;
 }
 snapshot({includeBodies=true}={}){const result={version:VERSION,modelKind:'discrete-local-slot-rule',interpolation:'snap-only',state:this.state,gameOverReason:this.gameOverReason,active:this.active,next:this.next,time:this.time,tick:this.gameTick,physicsTick:this.world.tick,score:this.score,level:this.level,cleared:this.cleared,rawCleared:this.rawCleared,pieces:this.pieces,lines:this.lines,chain:this.chain,maxChain:this.maxChain,added:this.added,bodyCount:this.world.stats().live,activeCount:this.world.active.size,sleepingCount:this.world.stats().sleeping,solver:this.solver,clearIds:this.pendingClear.flat(),events:this.events};if(includeBodies)result.bodies=this.world.bodies();return result;}
 frame({full=false}={}){return {...this.snapshot({includeBodies:false}),bodyPatch:this.world.consumeChanges({full})};}
}
