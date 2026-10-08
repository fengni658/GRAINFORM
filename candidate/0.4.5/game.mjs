import {World as AdaptiveWorld,R,D,DT} from './physics/adaptive.mjs';
import {World as BaselineWorld} from './physics/fast.mjs';
export {R,D,DT};
export const VERSION='0.4.5',BLOCK=24,LEFT=28,RIGHT=260,FLOOR=420,PER_CELL=169,PER_PIECE=676;
import {SHAPES,rotateShape,RNG} from './legacy-preview.js';
export {SHAPES,rotateShape,RNG};
export class Game {
 constructor({seed=1,solver='baseline'}={}){this.solver=solver;this.World=solver==='baseline'?BaselineWorld:AdaptiveWorld;this.reset(seed);}
 reset(seed=1){this.seed=seed>>>0;this.world=new this.World();this.rng=new RNG(this.seed);this.physicsRng=new RNG((this.seed^0x9e3779b9)>>>0);this.gameTick=0;this.time=0;this.rawCleared=0;this.state='ready';this.active=null;this.next=this.randomPiece();this.score=0;this.level=1;this.cleared=0;this.pieces=0;this.lines=0;this.chain=0;this.maxChain=0;this.added=0;this.events=[];this.eventSerial=0;this.fall=0;this.pendingClear=[];this.clearTimer=0;this.spawnDelay=0;this.lastScan=0;this.lastCounts={count:0,active:0};}
 emit(type,data={}){this.events.push({id:++this.eventSerial,type,tick:this.world.tick,...data});if(this.events.length>32)this.events.shift();}
 randomPiece(){return {shape:SHAPES[this.rng.int(7)].map(p=>p.slice()),color:1+this.rng.int(4)};}
 start(){if(this.state==='ready'){this.state='playing';this.spawn();return true;}return false;}
 pause(){if(this.state==='playing'){this.state='paused';return true;}return false;}
 resume(){if(this.state==='paused'){this.state='playing';return true;}return false;}
 spawn(){const p=this.next;this.next=this.randomPiece();const wide=(1+Math.max(...p.shape.map(v=>v[0])))*BLOCK;this.active={...p,x:Math.floor((288-wide)/2),y:0};this.fall=0;if(!this.canPlace(this.active)){this.active=null;this.state='over';this.emit('over');}}
 canPlace(p){if(!p)return false;for(const[bx,by]of p.shape){const x0=p.x+bx*BLOCK,y0=p.y+by*BLOCK,x1=x0+BLOCK,y1=y0+BLOCK;if(x0<LEFT||x1>RIGHT||y0<0||y1>FLOOR)return false;for(const b of this.world.near((x0+x1)/2,(y0+y1)/2,BLOCK/2+R)){const nx=Math.max(x0,Math.min(x1,b.x)),ny=Math.max(y0,Math.min(y1,b.y));if((b.x-nx)**2+(b.y-ny)**2<(R+.0002)**2)return false;}}return true;}
 acceptsInput(){return this.state==='playing'&&this.active&&!this.clearTimer;}
 move(dx){if(!this.acceptsInput()||!Number.isFinite(dx))return false;let moved=false,sign=Math.sign(dx);for(let i=0;i<Math.min(288,Math.abs(dx));i++){const p={...this.active,x:this.active.x+sign};if(!this.canPlace(p))break;this.active=p;moved=true;}return moved;}
 rotate(){if(!this.acceptsInput())return false;const shape=rotateShape(this.active.shape);for(const dx of[0,-BLOCK,BLOCK,-2*BLOCK,2*BLOCK]){const p={...this.active,x:this.active.x+dx,shape};if(this.canPlace(p)){this.active=p;return true;}}return false;}
 descend(pixels=1){if(!this.acceptsInput())return false;for(let i=0;i<pixels;i++){const p={...this.active,y:this.active.y+1};if(!this.canPlace(p)){this.land();return false;}this.active=p;}return true;}
 softDrop(){return this.descend(12);}
 drop(){if(!this.acceptsInput())return false;let d=0;while(this.canPlace({...this.active,y:this.active.y+1})){this.active.y++;d++;}this.score+=Math.floor(d/BLOCK)*2;this.land();return true;}
 grainPositions(p){const out=[];for(const[bx,by]of p.shape)for(let gy=0;gy<13;gy++)for(let gx=0;gx<13;gx++)out.push({x:p.x+bx*BLOCK+1+gx*1.76+(gy%2)*.88,y:p.y+by*BLOCK+(gy+.5)*BLOCK/13,color:p.color});return out;}
 approachingContact(){if(!this.active)return false;const p=this.active;for(const[bx,by]of p.shape){const x0=p.x+bx*BLOCK,y0=p.y+by*BLOCK,x1=x0+BLOCK,y1=y0+BLOCK;for(const b of this.world.near((x0+x1)/2,(y0+y1)/2,BLOCK/2+R+6)){const nx=Math.max(x0,Math.min(x1,b.x)),ny=Math.max(y0,Math.min(y1,b.y)),dx=b.x-nx,dy=b.y-ny,dist=Math.hypot(dx,dy);if(dist<=R+.75)return true;const approach=dist>0?-(dx*b.vx+dy*b.vy)/dist:0;if(approach>0&&dist-R<=approach*DT+.012)return true;}}return false;}
 land(){if(!this.active)return;if(!this.canPlace(this.active)){this.state='over';this.active=null;this.emit('over',{reason:'blocked-landing'});return;}
  const points=this.grainPositions(this.active);for(const p of points)for(const q of this.world.near(p.x,p.y))if(Math.hypot(p.x-q.x,p.y-q.y)<D+.0002)throw Error('Atomic landing precheck failed');
  const firstId=this.world.bs.length;for(const p of points){const b=this.world.add({...p,vx:(this.physicsRng.next()-.5)*2,vy:0});if(!b)throw Error('Atomic landing admission failed');}
  if(this.world.bs.length-firstId!==PER_PIECE)throw Error('Grain conservation failed');this.added+=PER_PIECE;this.pieces++;this.chain=0;this.emit('land',{count:PER_PIECE,color:this.active.color});this.active=null;this.spawnDelay=22/60;
 }
 findConnections(){const w=this.world,seen=new Set(),groups=[];for(const start of w.bs){if(!start.alive||seen.has(start.id))continue;const queue=[start],ids=[];seen.add(start.id);let left=false,right=false;while(queue.length){const b=queue.pop();ids.push(b.id);left ||= b.x-R<=LEFT+.012;right ||= b.x+R>=RIGHT-.012;for(const q of w.near(b.x,b.y,D+.012)){if(q.color!==b.color||seen.has(q.id)||Math.hypot(b.x-q.x,b.y-q.y)>D+.012)continue;seen.add(q.id);queue.push(q);}}if(left&&right)groups.push(ids);}return groups;}
 removeGroups(groups){const ids=[...new Set(groups.flat())],alive=ids.filter(id=>this.world.bs[id]?.alive);if(!alive.length)return 0;for(const id of alive)this.world.remove(id);this.chain++;this.maxChain=Math.max(this.maxChain,this.chain);this.score+=Math.round((alive.length*64/PER_CELL+groups.length*100)*this.level*this.chain);this.rawCleared+=alive.length;this.cleared=Math.floor(this.rawCleared*64/PER_CELL);this.lines+=groups.length;this.level=Math.min(20,1+Math.floor(this.rawCleared*64/PER_CELL/1800));this.emit('clear',{count:alive.length,regions:groups.length,chain:this.chain});return alive.length;}
 step(){if(this.state!=='playing')return false;this.gameTick++;this.time=this.gameTick*DT;
  // Preserve legacy clear contract: highlighted identities and all physics are
  // frozen during the 0.2-second clear animation, then support removal wakes sand.
  if(this.clearTimer>0){this.clearTimer=Math.max(0,this.clearTimer-DT);if(this.clearTimer<1e-10){this.removeGroups(this.pendingClear);this.pendingClear=[];this.clearTimer=0;this.spawnDelay=18/60;}return true;}
  if(this.active&&this.approachingContact())this.land();if(this.state!=='playing')return false;this.world.step();
  if(this.world.tick%16===0){const groups=this.findConnections();if(groups.length){this.pendingClear=groups;this.clearTimer=12/60;this.emit('clear-start',{count:groups.flat().length});return true;}}
  if(!this.active){this.spawnDelay-=DT;if(this.spawnDelay<=0)this.spawn();return true;}
  // A block stays intact until contact or bounded pre-contact conversion. Sand physics is
  // continuous; rigid block descent checks every logical unit to avoid tunneling.
  const speed=180*Math.min(1.45,.24+(this.level-1)*.065+Math.min(.4,this.pieces*.002));this.fall+=speed*DT;while(this.fall>=1&&this.active){this.fall-=1;if(!this.descend(1))break;}return true;
 }
 snapshot(){const bodies=this.world.bs.filter(b=>b.alive).map(({id,x,y,color,sleep})=>({id,x,y,color,sleep}));return {version:VERSION,state:this.state,active:this.active,next:this.next,bodies,time:this.time,tick:this.gameTick,physicsTick:this.world.tick,score:this.score,level:this.level,cleared:this.cleared,rawCleared:this.rawCleared,pieces:this.pieces,lines:this.lines,chain:this.chain,maxChain:this.maxChain,added:this.added,activeCount:this.world.active.size,solver:this.solver,clearIds:this.pendingClear.flat(),events:this.events};}
}
