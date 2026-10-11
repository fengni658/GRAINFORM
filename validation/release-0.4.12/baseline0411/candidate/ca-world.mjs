import {FIELD_WIDTH,FIELD_HEIGHT} from './board-geometry.mjs';
// Independently written gameplay CA, based on mechanisms described in the source review.
// Cells are material units, not hard circles. No third-party source copied.
export const CFG={width:FIELD_WIDTH,height:FIELD_HEIGHT,cell:1,dt:1/60,gravity:900,maxVertical:8,maxSlide:3,maxSpeed:480,chunk:16,massPerCell:676/2304,phases:17};
export class World{
 constructor(){const C=CFG.width*CFG.height;this.grid=new Int32Array(C);this.x=new Int16Array(C);this.y=new Int16Array(C);this.color=new Uint8Array(C);this.batch=new Uint16Array(C);this.live=new Uint8Array(C);this.vy=new Float64Array(C);this.credit=new Float64Array(C);this.n=0;this.count=0;this.identity=new Float64Array(C);this.freeSlots=new Int32Array(C);this.freeCount=0;this.tick=0;this.time=0;this.seed=0x842199;this.cols=Math.ceil(CFG.width/CFG.chunk);this.rows=Math.ceil(CFG.height/CFG.chunk);this.chunks=new Set();this.quiet=new Uint8Array(this.cols*this.rows);this.changed=new Uint8Array(this.quiet.length);this.potential=new Uint8Array(this.quiet.length);this.noMoveSweeps=0;this.pendingInbound=0;this.lastMoveTick=-1;this.presentedTick=-1;this.dirty=null;this.lastMoved=new Uint32Array(C);this.moveStamp=new Uint32Array(C);this.pathN=new Uint8Array(C);this.pathX=new Int16Array(C*18);this.pathY=new Int16Array(C*18);this.pathPhase=new Uint8Array(C*18);this.pathStamp=new Uint32Array(C);this.reserved=new Int32Array(C);this.reserveStamp=new Uint32Array(C);this.reserveEpoch=0;this.metrics={stepCalls:0,chunkVisits:0,cellVisits:0,particleVisits:0,pathMoves:0,directionChecks:0,verticalMoves:0,slideMoves:0};this.last={moves:0,movedParticles:0,particles:0,chunks:0,pending:0};this.audit=null;}
 rand(){let s=this.seed;s^=s<<13;s^=s>>>17;s^=s<<5;this.seed=s>>>0;return this.seed/4294967296}
 cell(x,y){return y*CFG.width+x}chunk(x,y){return Math.floor(y/CFG.chunk)*this.cols+Math.floor(x/CFG.chunk)}
 wake(x,y){
  // Preserve permissive direct-call behavior outside normal integer grid coordinates.
  if(!Number.isInteger(x)||!Number.isInteger(y)){for(let yy=Math.max(0,y-2);yy<=Math.min(CFG.height-1,y+2);yy++)for(let xx=Math.max(0,x-2);xx<=Math.min(CFG.width-1,x+2);xx++){const c=this.chunk(xx,yy);this.chunks.add(c);this.quiet[c]=0;this.changed[c]=1}return;}
  if(x+2<0||x-2>=CFG.width||y+2<0||y-2>=CFG.height)return;
  // Same first-insertion order as row-major cells, once per affected chunk.
  const x0=Math.floor(Math.max(0,x-2)/CFG.chunk),x1=Math.floor(Math.min(CFG.width-1,x+2)/CFG.chunk),y0=Math.floor(Math.max(0,y-2)/CFG.chunk),y1=Math.floor(Math.min(CFG.height-1,y+2)/CFG.chunk);
  for(let cy=y0;cy<=y1;cy++)for(let cx=x0;cx<=x1;cx++){const c=cy*this.cols+cx;this.chunks.add(c);this.quiet[c]=0;this.changed[c]=1}
 }

 markDirty(x,y){if(!this.dirty)this.dirty={x0:x,y0:y,x1:x,y1:y};else{this.dirty.x0=Math.min(this.dirty.x0,x);this.dirty.y0=Math.min(this.dirty.y0,y);this.dirty.x1=Math.max(this.dirty.x1,x);this.dirty.y1=Math.max(this.dirty.y1,y)}}
 // Storage is slot-indexed; public IDs are generation * capacity + slot.
 // No identity maps or allocation growth are needed in the material hot path.
 has(id){if(!Number.isSafeInteger(id)||id<0)return false;const i=id%this.live.length;return !!this.live[i]&&this.identity[i]===id}
 slotOf(id){if(!this.has(id))throw Error('missing-ID');return id%this.live.length}
 idAt(i){if(!Number.isInteger(i)||i<0||i>=this.n||!this.live[i])throw Error('missing-slot');return this.identity[i]}
 _resetSlot(i){this.vy[i]=0;this.credit[i]=0;this.lastMoved[i]=this.tick;this.moveStamp[i]=(this.tick-1)>>>0;this.pathN[i]=0;this.pathStamp[i]=(this.tick-1)>>>0;const p=i*18;this.pathX.fill(0,p,p+18);this.pathY.fill(0,p,p+18);this.pathPhase.fill(0,p,p+18)}
 admit(points,color,batch,initialVy=0){
  if(!Array.isArray(points))throw Error('admission-points');
  if(!Number.isFinite(color)||!Number.isFinite(batch)||!Number.isFinite(initialVy))throw Error('admission-fields');
  const staged=[],seen=new Set();for(const p of points){const {x,y}=p;if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||x>=CFG.width||y<0||y>=CFG.height)throw Error('admission-bounds');const q=this.cell(x,y);if(this.grid[q]||seen.has(q))throw Error('non-atomic-admission');seen.add(q);staged.push({x,y})}
  const C=this.live.length;if(this.count+staged.length>C)throw Error('capacity');
  // Check every future handle before touching slots, grid, counts or wake state.
  for(let k=0;k<Math.min(staged.length,this.freeCount);k++)if(!Number.isSafeInteger(this.identity[this.freeSlots[this.freeCount-1-k]]+C))throw Error('identity-exhausted');
  for(const p of staged){const reused=this.freeCount>0,i=reused?this.freeSlots[--this.freeCount]:this.n++;this.identity[i]=reused?this.identity[i]+C:i;this._resetSlot(i);this.live[i]=1;this.x[i]=p.x;this.y[i]=p.y;this.color[i]=color;this.batch[i]=batch;this.vy[i]=initialVy;this.grid[this.cell(p.x,p.y)]=i+1;this.count++;this.wake(p.x,p.y);this.markDirty(p.x,p.y)}this.noMoveSweeps=0;return staged.length
 }
 remove(ids){const slots=[],seen=new Set();for(const id of ids){const i=this.slotOf(id);if(seen.has(i))throw Error('duplicate-ID');seen.add(i);slots.push(i)}for(const i of slots){const x=this.x[i],y=this.y[i];this.grid[this.cell(x,y)]=0;this.live[i]=0;this.freeSlots[this.freeCount++]=i;this.count--;this.wake(x,y);this.markDirty(x,y)}this.noMoveSweeps=0}
 empty(x,y){return x>=0&&x<CFG.width&&y>=0&&y<CFG.height&&!this.grid[this.cell(x,y)]}
 record(i,phase){let n=this.pathN[i];if(n>=18)throw Error('path-capacity');const p=i*18+n;this.pathX[p]=this.x[i];this.pathY[p]=this.y[i];this.pathPhase[p]=phase;this.pathN[i]=n+1}
 move(i,x,y,phase){const ox=this.x[i],oy=this.y[i];if(!this.empty(x,y)||Math.abs(x-ox)+Math.abs(y-oy)!==1||y<oy)throw Error('invalid-local-path');this.grid[this.cell(ox,oy)]=0;this.grid[this.cell(x,y)]=i+1;this.x[i]=x;this.y[i]=y;this.record(i,phase);this.wake(ox,oy);this.wake(x,y);this.markDirty(ox,oy);this.markDirty(x,y);this.metrics.pathMoves++;this.last.moves++;this.lastMoved[i]=this.tick;if(this.moveStamp[i]!==this.tick){this.moveStamp[i]=this.tick;this.last.movedParticles++;}if(this.audit)this.audit(this.identity[i],ox,oy,x,y,phase)}
 roughness(i){let h=(i+1)>>>0;h=Math.imul(h^(h>>>16),0x7feb352d);h=Math.imul(h^(h>>>15),0x846ca68b);return 1+((h^(h>>>16))&1)}
 direction(i,dx,reservations=true){this.metrics.directionChecks++;const x=this.x[i],y=this.y[i],limit=this.roughness(this.identity[i]);for(let dist=1;dist<=limit;dist++){const xx=x+dx*dist;if(!this.empty(xx,y))return null;const a=this.cell(xx,y);if(reservations&&this.reserveStamp[a]===this.reserveEpoch)return null;if(!this.empty(xx,y+1))continue;const b=this.cell(xx,y+1);if(reservations&&this.reserveStamp[b]===this.reserveEpoch)continue;let depth=0;while(depth<8&&this.empty(xx,y+1+depth))depth++;return{dx,dist,depth}}return null}

 step(){this.metrics.stepCalls++;this.tick++;this.time+=CFG.dt;this.last={moves:0,movedParticles:0,particles:0,chunks:0,pending:0};this.dirty=null;if(!this.chunks.size)return;this.changed.fill(0);this.potential.fill(0);const ids=[];for(const c of this.chunks){this.metrics.chunkVisits++;this.last.chunks++;const cx=c%this.cols,cy=Math.floor(c/this.cols);for(let y=cy*16;y<Math.min((cy+1)*16,CFG.height);y++)for(let x=cx*16;x<Math.min((cx+1)*16,CFG.width);x++){this.metrics.cellVisits++;const v=this.grid[this.cell(x,y)];if(v)ids.push(v-1)}}ids.sort((a,b)=>this.y[b]-this.y[a]||((this.tick&1)?this.x[a]-this.x[b]:this.x[b]-this.x[a]));this.last.particles=ids.length;
 for(const i of ids){this.metrics.particleVisits++;this.vy[i]=Math.min(CFG.maxSpeed,this.vy[i]+CFG.gravity*CFG.dt);this.credit[i]=Math.min(8,this.credit[i]+this.vy[i]*CFG.dt);this.pathN[i]=0;this.pathStamp[i]=this.tick;this.record(i,0)}
 // Same-axis phases make interpolated unit-cell trajectories collision-safe.
 for(let round=0;round<8;round++)for(const i of ids)if(this.credit[i]>=1&&this.empty(this.x[i],this.y[i]+1)){this.move(i,this.x[i],this.y[i]+1,round+1);this.credit[i]--;this.metrics.verticalMoves++}
 for(let round=0;round<3;round++){this.reserveEpoch++;const selected=[];for(const i of ids){const x=this.x[i],y=this.y[i];if(this.credit[i]<1||y+1>=CFG.height||this.empty(x,y+1))continue;const l=this.direction(i,-1),r=this.direction(i,1);if(!l&&!r)continue;const d=!l?r:!r?l:l.depth>r.depth?l:r.depth>l.depth?r:this.rand()<.5?l:r;for(let k=1;k<=d.dist;k++)this.reserveStamp[this.cell(x+d.dx*k,y)]=this.reserveEpoch;this.reserveStamp[this.cell(x+d.dx*d.dist,y+1)]=this.reserveEpoch;this.move(i,x+d.dx,y,9+round*3);selected.push({i,dx:d.dx,dist:d.dist})}for(const d of selected)if(d.dist===2)this.move(d.i,this.x[d.i]+d.dx,this.y[d.i],10+round*3);for(const d of selected){this.move(d.i,this.x[d.i],this.y[d.i]+1,11+round*3);this.credit[d.i]--;this.metrics.slideMoves++}}

 // Quiet chunks must have no legal move, including credit-waiting particles.
 for(const i of ids){const x=this.x[i],y=this.y[i];if(this.empty(x,y+1)||this.direction(i,-1,false)!==null||this.direction(i,1,false)!==null){this.potential[this.chunk(x,y)]=1;this.last.pending++}}
 for(const c of [...this.chunks]){if(this.changed[c]||this.potential[c])this.quiet[c]=0;else if(++this.quiet[c]>=2)this.chunks.delete(c)}if(this.last.moves){this.noMoveSweeps=0;this.lastMoveTick=this.tick}else if(!this.last.pending)this.noMoveSweeps++;else this.noMoveSweeps=0;
 }
 completePresentation(){this.presentedTick=this.tick}
 ready(){return !this.pendingInbound&&!this.chunks.size&&this.noMoveSweeps>=2&&this.presentedTick>=this.lastMoveTick}
 positionAt(id,alpha){const i=this.slotOf(id);if(!this.pathN[i]||this.pathStamp[i]!==this.tick)return[this.x[i]+.5,this.y[i]+.5];const phase=alpha*17,n=this.pathN[i],base=i*18;let x=this.pathX[base],y=this.pathY[base];for(let j=1;j<n;j++){const k=base+j,end=this.pathPhase[k];if(phase<end-1)return[x+.5,y+.5];if(phase<end){const u=phase-(end-1);return[x+(this.pathX[k]-x)*u+.5,y+(this.pathY[k]-y)*u+.5]}x=this.pathX[k];y=this.pathY[k]}return[x+.5,y+.5]}
 snapshot(){const out=[];for(let i=0;i<this.n;i++)if(this.live[i])out.push({id:this.identity[i],x:this.x[i],y:this.y[i],color:this.color[i],batch:this.batch[i]});return out}
}
