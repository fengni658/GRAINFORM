/** Discrete local falling-sand game rule. Not a continuous collision solver.
 * Positions are legal triangular-slot endpoints; render snaps only, never a
 * swept/linear interpolation that would imply collision-free travel. */
const R=.875,LEFT=28,RIGHT=260,FLOOR=420,COLS=132,SPACING=(RIGHT-LEFT-2*R)/(COLS-1),HEIGHT=SPACING*Math.sqrt(3)/2;
export const SAND_CONTRACT=Object.freeze({modelKind:'discrete-local-slot-rule',interpolation:'snap-only',left:LEFT,right:RIGHT,floor:FLOOR,radius:R,diameter:2*R,spacing:SPACING,rowHeight:HEIGHT,evenColumns:132,oddColumns:131,dt:1/120,gravity:240,fallSpeedCap:60,maxMovesPerParticlePerTick:1,defaultMaxRows:276,colors:Object.freeze([1,2,3,4])});
export const rowColumns=row=>COLS-(row&1);
export function slotPosition(row,col){if(!Number.isInteger(row)||row<0||!Number.isInteger(col)||col<0||col>=rowColumns(row))throw new RangeError('Invalid triangular slot');return {x:LEFT+R+(col+(row&1)*.5)*SPACING,y:FLOOR-R-row*HEIGHT};}
const key=(row,col)=>row*COLS+col;
function adjacent(row,col){const shift=(row&1)?0:-1;return [[row,col-1],[row,col+1],[row-1,col+shift],[row-1,col+shift+1],[row+1,col+shift],[row+1,col+shift+1]];}
const RINGS=[0,1].map(parity=>{const seen=new Set([`${parity},0`]),queue=[[parity,0,0]],out=[];for(let at=0;at<queue.length;at++){const [r,c,d]=queue[at];out.push([r-parity,c]);if(d===2)continue;for(const [rr,cc]of adjacent(r,c)){const k=`${rr},${cc}`;if(!seen.has(k)){seen.add(k);queue.push([rr,cc,d+1]);}}}return out;});
const counters=()=>({visits:0,moves:0,downMoves:0,rollMoves:0,wakes:0,neighborVisits:0,creditIntegrations:0,waitingCredit:0,slept:0,queuePeak:0,maxMovesPerParticle:0});
const snapshotParticle=b=>({id:b.id,color:b.color,row:b.row,col:b.col,x:b.x,y:b.y,alive:b.alive,sleep:b.sleep,vy:b.vy,motionCredit:b.motionCredit,mustDescendAfterRoll:b.mustDescendAfterRoll,lastMovedTick:b.lastMovedTick});

export class LocalSandWorld{
 constructor({seed=1,maxRows=SAND_CONTRACT.defaultMaxRows,maxParticles=Infinity}={}){
  if(!Number.isInteger(maxRows)||maxRows<1||maxRows>100000)throw new RangeError('maxRows must be an integer in 1..100000');
  if(!(maxParticles===Infinity||(Number.isSafeInteger(maxParticles)&&maxParticles>=0)))throw new RangeError('Invalid maxParticles');
  if(!Number.isSafeInteger(seed))throw new TypeError('seed must be a safe integer');
  this.seed=seed;this.maxRows=maxRows;this.capacity=Math.ceil(maxRows/2)*132+Math.floor(maxRows/2)*131;this.maxParticles=Math.min(maxParticles,this.capacity);
  this.tick=0;this.time=0;this._records=new Map();this._occupied=new Map();this._active=new Set();this._live=0;this._sleeping=0;this._nextId=0;this._serial=0;this._revision=0;this._connectionCache=null;this._context=null;
  this._totals={...counters(),ticks:0,idleTicks:0,nonIdleTicks:0,externalNeighborVisits:0,externalWakes:0};this._lastTick={...counters(),tick:0,idle:true};this._firstTick=null;
 }
 _legal(row,col){return Number.isInteger(row)&&Number.isInteger(col)&&row>=0&&row<this.maxRows&&col>=0&&col<rowColumns(row);}
 slotAt(x,y){if(!Number.isFinite(x)||!Number.isFinite(y)||x<LEFT+R||x>RIGHT-R||y>FLOOR-R)return null;const row=Math.round((FLOOR-R-y)/HEIGHT),col=Math.round((x-LEFT-R)/SPACING-(row&1)*.5);return this._legal(row,col)?{row,col}:null;}
 at(row,col){if(!this._legal(row,col))return null;const id=this._occupied.get(key(row,col));return id===undefined?null:snapshotParticle(this._records.get(id));}
 add(spec){return this.addMany([spec]);}
 addMany(specs){
  if(!Array.isArray(specs))throw new TypeError('addMany expects an array');
  if(this._live+specs.length>this.maxParticles)return {accepted:false,addedIds:[],reason:'capacity',requested:specs.length,available:this.maxParticles-this._live};
  const staged=[],ids=new Set(),slots=new Set();let nextId=this._nextId;
  for(let index=0;index<specs.length;index++){
   const p=specs[index];if(!p||!Number.isInteger(p.color)||p.color<1||p.color>4)return {accepted:false,addedIds:[],reason:'invalid-color',index};
   let id=p.id;if(id===undefined){while(this._records.has(nextId)||ids.has(nextId))nextId++;id=nextId++;}
   if(!((typeof id==='string'&&id.length>0)||(typeof id==='number'&&Number.isSafeInteger(id))))return {accepted:false,addedIds:[],reason:'invalid-id',index};
   if(this._records.has(id)||ids.has(id))return {accepted:false,addedIds:[],reason:'duplicate-or-retired-id',index,id};
   const slot=p.row!==undefined||p.col!==undefined?{row:p.row,col:p.col}:this.slotAt(p.x,p.y);
   if(!slot||!this._legal(slot.row,slot.col))return {accepted:false,addedIds:[],reason:'invalid-slot',index,id};
   const k=key(slot.row,slot.col);if(this._occupied.has(k)||slots.has(k))return {accepted:false,addedIds:[],reason:'occupied-slot',index,id};
   ids.add(id);slots.add(k);staged.push({id,color:p.color,...slot,...slotPosition(slot.row,slot.col)});
  }
  this._nextId=nextId;
  for(const p of staged){const b={...p,serial:this._serial++,alive:true,sleep:false,vy:0,motionCredit:0,mustDescendAfterRoll:false,lastVisitedTick:-1,lastMovedTick:-1,queuedTick:-1};this._records.set(b.id,b);this._occupied.set(key(b.row,b.col),b.id);this._active.add(b.id);this._live++;}
  // Adding occupancy cannot create a legal move for a sleeping grain. New grains
  // are already active; no whole-field or redundant neighbor wake is required.
  if(staged.length){this._revision++;this._connectionCache=null;}
  return {accepted:true,addedIds:staged.map(p=>p.id),count:staged.length};
 }
 _wake(b){if(!b?.alive)return;if(b.sleep){b.sleep=false;this._sleeping--;if(this._context)this._context.metrics.wakes++;else this._totals.externalWakes++;}this._active.add(b.id);const ctx=this._context;if(ctx&&b.lastVisitedTick!==this.tick&&b.queuedTick!==this.tick){b.queuedTick=this.tick;ctx.queue.push(b.id);ctx.metrics.queuePeak=Math.max(ctx.metrics.queuePeak,ctx.queue.length);}}
 _wakeVacancy(row,col,exclude){for(const [dr,dc]of RINGS[row&1]){const r=row+dr,c=col+dc;if(!this._legal(r,c))continue;if(this._context)this._context.metrics.neighborVisits++;else this._totals.externalNeighborVisits++;const id=this._occupied.get(key(r,c));if(id!==undefined&&id!==exclude)this._wake(this._records.get(id));}}
 remove(ids){
  if(!Array.isArray(ids))throw new TypeError('remove expects an ID array');const unique=[...new Set(ids)],unknownIds=unique.filter(id=>!this._records.has(id));
  if(unknownIds.length)return {removedIds:[],rejected:true,reason:'unknown-id',unknownIds};
  const removed=[];for(const id of unique){const b=this._records.get(id);if(!b.alive)continue;if(b.sleep)this._sleeping--;b.alive=false;b.sleep=false;b.vy=0;b.motionCredit=0;this._occupied.delete(key(b.row,b.col));this._active.delete(id);this._live--;removed.push(b);}
  // Remove all requested occupancy first, then wake only fixed radius-two rings.
  for(const b of removed)this._wakeVacancy(b.row,b.col,b.id);
  if(removed.length){this._revision++;this._connectionCache=null;}
  return {removedIds:removed.map(b=>b.id),rejected:false};
 }
 _empty(row,col){return this._legal(row,col)&&!this._occupied.has(key(row,col));}
 _down(row,col,preferRight){if(row===0)return null;const shift=(row&1)?0:-1;for(const d of preferRight?[1,0]:[0,1]){const c=col+shift+d;if(this._empty(row-1,c))return {row:row-1,col:c,kind:'down',cost:HEIGHT};}return null;}
 _findMove(b){const right=((b.serial+this.tick+this.seed)&1)===1,down=this._down(b.row,b.col,right);if(down)return down;if(b.mustDescendAfterRoll)return null;
  for(const d of right?[1,-1]:[-1,1]){const c=b.col+d;if(this._empty(b.row,c)&&this._down(b.row,c,right))return {row:b.row,col:c,kind:'roll',cost:SPACING};}return null;
 }
 _sleep(b,metrics){if(!b.sleep){b.sleep=true;this._sleeping++;metrics.slept++;}b.vy=0;b.motionCredit=0;this._active.delete(b.id);}
 _visit(b,metrics){
  if(!b.alive||b.lastVisitedTick===this.tick)return;b.lastVisitedTick=this.tick;this._active.delete(b.id);metrics.visits++;
  const move=this._findMove(b);if(!move){this._sleep(b,metrics);return;}
  b.vy=Math.min(SAND_CONTRACT.fallSpeedCap,b.vy+SAND_CONTRACT.gravity*SAND_CONTRACT.dt);b.motionCredit+=b.vy*SAND_CONTRACT.dt;metrics.creditIntegrations++;
  if(b.motionCredit+1e-12<move.cost){metrics.waitingCredit++;this._active.add(b.id);return;}
  if(b.lastMovedTick===this.tick)throw new Error('Per-particle per-tick movement budget violated');
  const oldRow=b.row,oldCol=b.col;this._occupied.delete(key(oldRow,oldCol));
  if(!this._empty(move.row,move.col))throw new Error('Move endpoint became occupied');
  b.row=move.row;b.col=move.col;Object.assign(b,slotPosition(b.row,b.col));b.motionCredit=Math.max(0,b.motionCredit-move.cost);b.mustDescendAfterRoll=move.kind==='roll';b.lastMovedTick=this.tick;
  this._occupied.set(key(b.row,b.col),b.id);metrics.moves++;metrics.maxMovesPerParticle=1;if(move.kind==='down')metrics.downMoves++;else metrics.rollMoves++;
  this._revision++;this._connectionCache=null;this._wakeVacancy(oldRow,oldCol,b.id);
  if(this._findMove(b))this._active.add(b.id);else this._sleep(b,metrics);
 }
 _stepOnce(){
  this.tick++;this.time=this.tick*SAND_CONTRACT.dt;const metrics={...counters(),tick:this.tick,idle:this._active.size===0};
  if(!metrics.idle){const queue=[...this._active];for(const id of queue)this._records.get(id).queuedTick=this.tick;this._active.clear();metrics.queuePeak=queue.length;this._context={queue,metrics};
   try{for(let i=0;i<queue.length;i++){const b=this._records.get(queue[i]);this._visit(b,metrics);}}finally{this._context=null;}
  }
  this._lastTick=metrics;if(this.tick===1)this._firstTick={...metrics};this._totals.ticks++;if(metrics.idle)this._totals.idleTicks++;else this._totals.nonIdleTicks++;
  for(const k of Object.keys(counters())){if(k==='queuePeak'||k==='maxMovesPerParticle')this._totals[k]=Math.max(this._totals[k],metrics[k]);else this._totals[k]+=metrics[k];}
 }
 step(n=1){if(!Number.isSafeInteger(n)||n<0)throw new RangeError('step count must be a nonnegative integer');for(let i=0;i<n;i++)this._stepOnce();return {tick:this.tick,time:this.time,steps:n,lastTick:{...this._lastTick},active:this._live-this._sleeping,sleeping:this._sleeping};}
 stats(){return {live:this._live,active:this._live-this._sleeping,sleeping:this._sleeping,queued:this._active.size,capacity:this.capacity,maxParticles:this.maxParticles,maxRows:this.maxRows,revision:this._revision,totals:{...this._totals},lastTick:{...this._lastTick},firstTick:this._firstTick?{...this._firstTick}:null};}
 snapshot({includeDead=false}={}){const particles=[];for(const b of this._records.values())if(b.alive||includeDead)particles.push(snapshotParticle(b));return {modelKind:SAND_CONTRACT.modelKind,interpolation:'snap-only',tick:this.tick,time:this.time,particles,stats:this.stats()};}
 connections(){
  if(this._connectionCache)return this._connectionCache;const seen=new Set(),components=[];
  for(const b of this._records.values()){if(!b.alive||seen.has(b.id))continue;const queue=[b.id],ids=[];seen.add(b.id);let touchesLeft=false,touchesRight=false;
   for(let i=0;i<queue.length;i++){const q=this._records.get(queue[i]);ids.push(q.id);touchesLeft||=Math.abs(q.x-(LEFT+R))<1e-8;touchesRight||=Math.abs(q.x-(RIGHT-R))<1e-8;
    for(const [r,c]of adjacent(q.row,q.col)){if(!this._legal(r,c))continue;const id=this._occupied.get(key(r,c));if(id===undefined||seen.has(id))continue;const neighbor=this._records.get(id);if(neighbor.color===b.color){seen.add(id);queue.push(id);}}
   }
   components.push(Object.freeze({color:b.color,ids:Object.freeze(ids),touchesLeft,touchesRight,crosses:touchesLeft&&touchesRight}));
  }
  const spanningComponents=components.filter(c=>c.crosses);return this._connectionCache=Object.freeze({components:Object.freeze(components),spanningComponents:Object.freeze(spanningComponents),crossingColors:Object.freeze([...new Set(spanningComponents.map(c=>c.color))]),revision:this._revision});
 }
}

/** Independent geometric audit: spatial bins of actual XY, not slot adjacency. */
export function auditCircles(input,{tolerance=1e-9}={}){
 const list=Array.isArray(input)?input:input?.particles;if(!Array.isArray(list))throw new TypeError('auditCircles expects particles or snapshot');
 const alive=list.filter(p=>p.alive!==false),bins=new Map(),ids=new Set(),slots=new Set();let finite=true,uniqueIds=true,uniqueSlots=true,maxOverlap=0,wallPenetration=0,overlapPairs=0,pairChecks=0;
 for(const p of alive){if(!Number.isFinite(p.x)||!Number.isFinite(p.y)){finite=false;continue;}if(ids.has(p.id))uniqueIds=false;ids.add(p.id);if(Number.isInteger(p.row)&&Number.isInteger(p.col)){const slot=`${p.row},${p.col}`;if(slots.has(slot))uniqueSlots=false;slots.add(slot);}wallPenetration=Math.max(wallPenetration,LEFT+R-p.x,p.x-(RIGHT-R),p.y-(FLOOR-R));
  const cx=Math.floor(p.x/(2*R)),cy=Math.floor(p.y/(2*R));for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const candidates=bins.get(`${cx+dx},${cy+dy}`);if(!candidates)continue;for(const q of candidates){pairChecks++;const overlap=2*R-Math.hypot(p.x-q.x,p.y-q.y);maxOverlap=Math.max(maxOverlap,overlap);if(overlap>tolerance)overlapPairs++;}}
  const bin=`${cx},${cy}`;if(!bins.has(bin))bins.set(bin,[]);bins.get(bin).push(p);
 }
 return {passed:finite&&uniqueIds&&uniqueSlots&&maxOverlap<=tolerance&&wallPenetration<=tolerance,aliveCount:alive.length,finite,uniqueIds,uniqueSlots,maxOverlap,wallPenetration,overlapPairs,pairChecks};
}
