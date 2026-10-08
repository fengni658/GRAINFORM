export const R=.875,D=2*R,SKIN=.0002,DT=1/120,CELL=1.8;
export class World{
 constructor({cache=true,regions=true}={}){this.bs=[];this.grid=new Map();this.active=new Set();this.cache=cache;this.regions=regions;this.time=0;this.tick=0;this.clusterStats={candidates:0,admitted:0,rejected:0};this.counters={queries:0,pairs:0,wakes:0};this.timing={physics:0,scheduling:0};}
 cellKey(ix,iy){return ix>=0&&ix<512&&iy>=-1048576&&iy<1048576?(iy+1048576)*512+ix:ix+','+iy;}
 key(x,y){return this.cellKey(Math.floor(x/CELL),Math.floor(y/CELL))}
 index(b){let k=this.key(b.x,b.y);if(k===b.key)return;if(b.key!==null&&b.key!==undefined){let s=this.grid.get(b.key);s.delete(b.id);if(!s.size)this.grid.delete(b.key)}if(!this.grid.has(k))this.grid.set(k,new Set());this.grid.get(k).add(b.id);b.key=k;}
 near(x,y,r=2){this.counters.queries++;let out=[];for(let ix=Math.floor((x-r)/CELL);ix<=Math.floor((x+r)/CELL);ix++)for(let iy=Math.floor((y-r)/CELL);iy<=Math.floor((y+r)/CELL);iy++){let s=this.grid.get(this.cellKey(ix,iy));if(s)for(let id of s){let b=this.bs[id];if(b?.alive)out.push(b)}}return out;}
 add({x=144,y=12,vx=0,vy=0,color=1}={}){if(![x,y,vx,vy].every(Number.isFinite)||Math.hypot(vx,vy)>600)throw new RangeError('Supported initial speed is finite and <=600 logical units/s');if(x<28+R||x>260-R||y>420-R)return null;for(let q of this.near(x,y))if(Math.hypot(x-q.x,y-q.y)<D+SKIN)return null;let b={id:this.bs.length,x,y,vx,vy,color,radius:.87,alive:true,sleep:false,quiet:0,deps:[],users:new Set(),key:null};this.bs.push(b);this.index(b);this.active.add(b.id);return b;}
 wake(id){let seen=new Set(),queue=[id];while(queue.length){let k=queue.pop(),b=this.bs[k];if(!b?.alive||seen.has(k))continue;seen.add(k);for(let u of b.users)queue.push(u);}for(let k of seen){let b=this.bs[k];if(b.sleep){b.sleep=false;this.counters.wakes++;this.active.add(k);}b.quiet=0;b.restWindow=[];b.contactIds=[];for(let d of b.deps)this.bs[d]?.users.delete(k);b.deps=[];b.users.clear();}}

 remove(id){let b=this.bs[id];if(!b?.alive)return;this.wake(id);for(let q of this.near(b.x,b.y,D+.012))if(Math.hypot(b.x-q.x,b.y-q.y)<=D+.012)this.wake(q.id);b.alive=false;this.active.delete(id);this.grid.get(b.key)?.delete(id);}
 support(b){let deps=[],left=false,right=false,single=false,floor=b.y>=420-R-.001;for(let q of this.near(b.x,b.y)){if(q.id===b.id||!q.sleep)continue;let dx=b.x-q.x,dy=b.y-q.y,d=Math.hypot(dx,dy);if(d>D+.006||dy>=-.05)continue;deps.push(q.id);let nx=dx/d,ny=dy/d;if(nx<-.015)left=true;if(nx>.015)right=true;if(Math.abs(nx)<=.30*(-ny))single=true;}return {valid:floor||single||(left&&right),deps:floor?[]:deps};}
 sleepBody(b,deps){b.sleep=true;b.vx=b.vy=0;this.active.delete(b.id);b.deps=deps;for(let d of deps)this.bs[d].users.add(b.id);}
 configurations(b,allowed){if(b.y>=420-R-.001)return [[]];let contacts=[];for(let q of this.near(b.x,b.y,D+.012)){if(q.id===b.id||(!q.sleep&&!allowed.has(q.id)))continue;let dx=b.x-q.x,dy=b.y-q.y,d=Math.hypot(dx,dy);if(d>D+.012||d<1e-9||(d>D+.006&&!b.contactIds?.includes(q.id)))continue;let nx=dx/d,ny=dy/d;contacts.push({id:q.id,nx,ny,original:true});for(let sign of [-1,1])contacts.push({id:q.id,nx:(nx-sign*.30*ny)/Math.sqrt(1.09),ny:(ny+sign*.30*nx)/Math.sqrt(1.09)});}let configs=[];for(let c of contacts)if(c.original&&c.ny<0&&Math.abs(c.nx)<=.30*(-c.ny))configs.push([c.id]);for(let i=0;i<contacts.length;i++)for(let j=i+1;j<contacts.length;j++){let a=contacts[i],b=contacts[j];if(a.id===b.id||a.nx*b.nx>=0)continue;let x=Math.abs(a.nx),y=Math.abs(b.nx);if((a.ny*y+b.ny*x)/(x+y)<-.0001)configs.push([a.id,b.id]);}return configs;}
 sleepStableRegions(ids,strict=true){let allowed=new Set(ids.filter(id=>{let b=this.bs[id];return b.quiet>=30&&(!strict||(b.restWindow?.length===30&&b.restWindow.reduce((a,b)=>a+b,0)<=.01));})),configs=new Map();this.clusterStats.candidates=allowed.size;
 // Remove candidates without force-direction support in the remaining set.
 let changed=true;while(changed){changed=false;for(let id of [...allowed]){let c=this.configurations(this.bs[id],allowed);if(!c.length){allowed.delete(id);configs.delete(id);changed=true;}else configs.set(id,c);}}
 // Reachable directed support witnesses; purely cyclic floating sets are rejected.
 let distance=new Map();for(let b of this.bs)if(b?.alive&&b.sleep)distance.set(b.id,0);for(let id of allowed)if(configs.get(id).some(c=>!c.length))distance.set(id,0);
 changed=true;while(changed){changed=false;for(let id of allowed){if(distance.has(id))continue;let ds=configs.get(id).flat().filter(d=>distance.has(d)).map(d=>distance.get(d));if(ds.length){distance.set(id,Math.min(...ds)+1);changed=true;}}}
 let admit=[...allowed].filter(id=>distance.has(id));
 // A chosen configuration must have an anchored path, and all partners admitted or already sleeping.
 let usable=new Set(admit);changed=true;while(changed){changed=false;for(let id of [...usable])if(!configs.get(id).some(c=>c.every(d=>this.bs[d].sleep||usable.has(d)))){usable.delete(id);changed=true;}}
 const chosen=new Map();for(let id of usable){let d=distance.get(id),options=configs.get(id).filter(c=>c.every(k=>this.bs[k].sleep||usable.has(k))&&(!c.length||c.some(k=>distance.get(k)<d)));options.sort((a,b)=>a.length-b.length||a.reduce((s,k)=>s+distance.get(k),0)-b.reduce((s,k)=>s+distance.get(k),0));if(options.length)chosen.set(id,options[0]);}
 // Conservative closure: do not reference a candidate that was not accepted.
 changed=true;while(changed){changed=false;for(let [id,c] of chosen)if(c.some(d=>!this.bs[d].sleep&&!chosen.has(d))){chosen.delete(id);changed=true;}}
 for(let [id,c]of chosen)this.sleepBody(this.bs[id],c);this.clusterStats.admitted+=chosen.size;this.clusterStats.rejected=allowed.size-chosen.size;
 }
 step(){this.tick++;for(let id of this.active)this.bs[id].contactIds=[];let tickStart=new Map([...this.active].map(id=>[id,[this.bs[id].x,this.bs[id].y]]));let tt=performance.now(),ids=this.cache?[...this.active]:this.bs.filter(b=>b.alive&&!b.sleep).map(b=>b.id);
 // A moving particle wakes a contacted sleeping component before projection.
 for(let id of ids){let b=this.bs[id],freeY=Math.min(60,b.vy+240*DT),speed=Math.hypot(b.vx,freeY);for(let q of this.near(b.x,b.y,D+speed*DT+.2))if(q.sleep&&Math.hypot(b.x-q.x,b.y-q.y)<D+speed*DT+.12&&((b.x-q.x)*b.vx+(b.y-q.y)*freeY)/Math.hypot(b.x-q.x,b.y-q.y)<-8)this.wake(q.id);}
 ids=[...this.active];this.timing.scheduling+=performance.now()-tt;tt=performance.now();
 let maxspeed=0;for(let id of ids){let b=this.bs[id];maxspeed=Math.max(maxspeed,Math.hypot(b.vx,b.vy+240*DT));}let subs=Math.max(1,Math.ceil(maxspeed*DT/.3));subs=Math.min(100,subs);let dt=DT/subs;
 for(let sub=0;sub<subs;sub++){
 for(let id of ids){let b=this.bs[id];b.ox=b.x;b.oy=b.y;b.vy=Math.min(60,b.vy+240*dt);b.x+=b.vx*dt;b.y+=b.vy*dt;this.index(b);}
 let touched=new Uint8Array(this.bs.length),pairs=[];for(let id of ids){let b=this.bs[id];for(let q of this.near(b.x,b.y,D+.65))if(q.id>id||q.sleep)pairs.push(b,q);}
 for(let iter=0;iter<64;iter++){
 for(let id of ids){let b=this.bs[id];b.x=Math.max(28+R,Math.min(260-R,b.x));if(b.y>=420-R)touched[b.id]=1;b.y=Math.min(420-R,b.y);}
 for(let pairIndex=0;pairIndex<pairs.length;pairIndex+=2){let b=pairs[pairIndex],q=pairs[pairIndex+1];this.counters.pairs++;let dx=b.x-q.x,dy=b.y-q.y,dd=dx*dx+dy*dy;if(dd>=(D+.004)**2)continue;if(iter===0||iter===63){b.contactIds??=[];if(!b.contactIds.includes(q.id))b.contactIds.push(q.id);if(!q.sleep){q.contactIds??=[];if(!q.contactIds.includes(b.id))q.contactIds.push(b.id);}}touched[b.id]=1;touched[q.id]=1;let dist=Math.sqrt(dd)||1e-9,nx=dx/dist,ny=dy/dist,err=D+.004-dist,weight=q.sleep?1:(iter<24?.5:1/(1+Math.exp((b.y-q.y)*1.5)));b.x+=nx*err*weight;b.y+=ny*err*weight;if(!q.sleep){q.x-=nx*err*(1-weight);q.y-=ny*err*(1-weight);}
 let relx=(b.x-b.ox)-(q.sleep?0:q.x-q.ox),rely=(b.y-b.oy)-(q.sleep?0:q.y-q.oy),tangent=-relx*ny+rely*nx;let f=Math.max(-.15*err,Math.min(.15*err,tangent))*weight;b.x+=ny*f;b.y-=nx*f;if(!q.sleep){q.x-=ny*f*(1-weight)/weight;q.y+=nx*f*(1-weight)/weight;}
 }}

 // Final normal-only contact closure: friction must not leave newly introduced overlap.
 for(let pass=0;pass<8;pass++){for(let id of ids){let b=this.bs[id];b.x=Math.max(28+R,Math.min(260-R,b.x));b.y=Math.min(420-R,b.y);}for(let pairIndex=0;pairIndex<pairs.length;pairIndex+=2){let b=pairs[pairIndex],q=pairs[pairIndex+1];this.counters.pairs++;let dx=b.x-q.x,dy=b.y-q.y,dd=dx*dx+dy*dy;if(dd>=(D+.004)**2)continue;let dist=Math.sqrt(dd)||1e-9,err=D+.004-dist,weight=q.sleep?1:1/(1+Math.exp((b.y-q.y)*1.5));b.x+=dx/dist*err*weight;b.y+=dy/dist*err*weight;if(!q.sleep){q.x-=dx/dist*err*(1-weight);q.y-=dy/dist*err*(1-weight);}}}

 for(let id of ids){let b=this.bs[id];b.x=Math.max(28+R,Math.min(260-R,b.x));b.y=Math.min(420-R,b.y);this.index(b);b.vx=(b.x-b.ox)/dt*(touched[id]?.75:1);b.vy=(b.y-b.oy)/dt*(touched[id]?.75:1);if(b.y>=420-R-1e-6)b.vx*=.7;}
 }
 for(let id of ids){let b=this.bs[id],prev=tickStart.get(id)||[b.x,b.y];b.restWindow??=[];b.restWindow.push(Math.hypot(b.x-prev[0],b.y-prev[1]));if(b.restWindow.length>30)b.restWindow.shift();if(Math.hypot(b.vx,b.vy)<.2)b.quiet++;else b.quiet=0;}
 this.timing.physics+=performance.now()-tt;tt=performance.now();
 if(this.regions&&this.tick%8===0)this.sleepStableRegions(ids);
 ids=[...this.active];
 for(let id of ids){let b=this.bs[id];if(b.quiet>=30){let s=this.support(b);if(s.valid)this.sleepBody(b,s.deps);}}
 ids=[...this.active];
 // Conventional island sleep: all members quiet and connected to floor.
 let seen=new Set();for(let id of ids){if(seen.has(id))continue;let component=[],queue=[id],anchor=false,quiet=true;seen.add(id);while(queue.length){let j=queue.pop(),b=this.bs[j];component.push(b);anchor ||= b.y>=420-R-.002;quiet &&= b.quiet>=30;for(let q of this.near(b.x,b.y,D+.012)){if(q.id===j||Math.hypot(b.x-q.x,b.y-q.y)>D+.012)continue;if(q.sleep)anchor=true;else if(!seen.has(q.id)){seen.add(q.id);queue.push(q.id);}}}if(anchor&&quiet){if(this.regions)this.sleepStableRegions(component.map(b=>b.id),false);else for(let b of component){let deps=this.near(b.x,b.y,D+.012).filter(q=>q.id!==b.id&&Math.hypot(b.x-q.x,b.y-q.y)<=D+.012).map(q=>q.id);this.sleepBody(b,deps);}}}

 
 this.timing.scheduling+=performance.now()-tt;this.time+=DT;}

 snapshot(){return {tick:this.tick,N:this.bs.filter(b=>b.alive).length,seconds:this.time,active:this.active.size,sleeping:this.bs.filter(b=>b.alive&&b.sleep).length,bodies:this.bs.filter(b=>b.alive).map(({users,key,...b})=>b),timing:this.timing,counters:this.counters};}
}
export function audit(w){let maxOverlap=0,wall=0,unsupported=0;let grounded=new Set(),queue=[];for(let b of w.bs){if(!b.alive)continue;if(b.sleep&&b.y>=420-R-.002){grounded.add(b.id);queue.push(b.id);}wall=Math.max(wall,28+R-b.x,b.x-(260-R),b.y-(420-R));for(let q of w.near(b.x,b.y))if(q.id>b.id)maxOverlap=Math.max(maxOverlap,D-Math.hypot(b.x-q.x,b.y-q.y));}while(queue.length){let b=w.bs[queue.pop()];for(let q of w.near(b.x,b.y,D+.012))if(q.sleep&&!grounded.has(q.id)&&Math.hypot(b.x-q.x,b.y-q.y)<=D+.012){grounded.add(q.id);queue.push(q.id);}}for(let b of w.bs)if(b.alive&&b.sleep&&!grounded.has(b.id))unsupported++;return {maxOverlap,wall,unsupported,passed:maxOverlap<=.002&&wall<=.002&&!unsupported};}
