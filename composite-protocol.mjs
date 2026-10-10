import {positionOnPath} from './ca-layer.mjs';
import {LEFT,RIGHT,FLOOR,FIELD_WIDTH,FIELD_HEIGHT} from './board-geometry.mjs';
export const DT=1000/60;
const CAPACITY=FIELD_WIDTH*FIELD_HEIGHT;
export const pointsIn=frame=>frame.paths.reduce((n,p)=>n+p.points.length/3,0);
export class ResourceLimit extends Error{}
const integer=(v,min=0)=>Number.isSafeInteger(v)&&v>=min;
const validIds=ids=>{if(!Array.isArray(ids)||ids.length>CAPACITY)return false;const seen=new Set();for(let i=0;i<ids.length;i++){if(!Object.hasOwn(ids,i)||!integer(ids[i])||seen.has(ids[i]))return false;seen.add(ids[i]);}return true;};
const validBirths=births=>{if(!Array.isArray(births)||births.length>CAPACITY)return false;const slots=new Set();for(let i=0;i<births.length;i++){const b=births[i];if(!Object.hasOwn(births,i)||!b||!integer(b.id)||!Number.isFinite(b.x)||!Number.isFinite(b.y)||!Number.isInteger(b.x-.5)||!Number.isInteger(b.y-.5)||b.x<LEFT+.5||b.x>RIGHT-.5||b.y<.5||b.y>FLOOR-.5||slots.has(b.id%CAPACITY))return false;slots.add(b.id%CAPACITY);}return true;};
// Transactional, touched-slot overlay; no full state copy or mutation on reject.
function identityDelta(prior,frames,removedIds=[],births=[]){
 const delta=new Map(),get=slot=>delta.get(slot)??prior.get(slot);
 for(const id of removedIds){const slot=id%CAPACITY,old=get(slot);if(old&&(old.id!==id||!old.alive))return null;delta.set(slot,{id,alive:false});}
 for(const birth of births){const slot=birth.id%CAPACITY,old=get(slot);if(old&&(old.alive||old.id>=birth.id))return null;delta.set(slot,{id:birth.id,alive:true,hasPose:true,x:birth.x,y:birth.y});}
 for(const f of frames)for(const p of f.paths){const slot=p.id%CAPACITY,old=get(slot),a=p.points;
  if(old&&(old.id>p.id||(old.id===p.id&&!old.alive)||(old.id<p.id&&old.alive)))return null;
  if(old?.id===p.id&&old.hasPose&&(old.x!==a[0]||old.y!==a[1]))return null;
  delta.set(slot,{id:p.id,alive:true,hasPose:true,x:a[a.length-3],y:a[a.length-2]});
 }return delta;
}
const commitIdentity=(state,delta)=>{for(const [slot,value]of delta)state.set(slot,value);};
export function validFrame(f){
 if(!f||!integer(f.token,1)||!integer(f.ruleTick,1)||f.phases!==68||!Number.isFinite(f.durationMs)||Math.abs(f.durationMs-DT)>1e-8||!Array.isArray(f.paths))return false;
 const ids=new Set(),slots=new Set();
 for(const p of f.paths){if(!p||typeof p!=='object'||!integer(p.id)||ids.has(p.id)||slots.has(p.id%CAPACITY)||!Array.isArray(p.points)||p.points.length<6||p.points.length>207||p.points.length%3)return false;ids.add(p.id);slots.add(p.id%CAPACITY);
  for(let i=0;i<p.points.length;i+=3){const x=p.points[i],y=p.points[i+1],t=p.points[i+2];if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isInteger(x-.5)||!Number.isInteger(y-.5)||x<LEFT+.5||x>RIGHT-.5||y<.5||y>FLOOR-.5||!integer(t)||t>68||(i===0&&t!==0))return false;if(i&&(t<=p.points[i-1]||Math.abs(x-p.points[i-3])+Math.abs(y-p.points[i-2])!==1))return false;}
 }return true;
}
export function validGroup(g){
 if(!g||!integer(g.epoch,1)||!integer(g.burst,1)||!integer(g.pieceId)||!integer(g.groupId,1)||!integer(g.revision)||!integer(g.lastControlTick,g.lastToken)||typeof g.quiet!=='boolean'||!validIds(g.removedIds)||!validBirths(g.births)||!integer(g.tickCount,1)||g.tickCount>4||!Number.isFinite(g.durationMs)||Math.abs(g.durationMs-g.tickCount*DT)>1e-8||!Array.isArray(g.frames)||g.frames.length!==g.tickCount)return false;
 let previousRule=null;
 for(let i=0;i<g.frames.length;i++){const f=g.frames[i];if(!validFrame(f)||f.token!==g.firstToken+i||(previousRule!==null&&(f.ruleTick<=previousRule||f.ruleTick-previousRule>4)))return false;previousRule=f.ruleTick;}
 return g.frames[0].token===g.firstToken&&g.frames.at(-1).token===g.lastToken&&g.frames.at(-1).ruleTick===g.lastRuleTick&&g.points===g.frames.reduce((n,f)=>n+pointsIn(f),0)&&identityDelta(new Map(),g.frames,g.removedIds,g.births)!==null;
}
// Experimental composite ACK certifies only the group's FINAL pose.
export class CompositeBuilder {
 constructor({epoch=1,k=4,softPoints=1048576,hardPoints=2097152,maxFramePoints=262144,maxInFlight=2}={}){
  if(!integer(epoch,1)||!integer(softPoints,1)||!integer(hardPoints,1)||!integer(k,1)||k>4||!integer(maxFramePoints,1)||hardPoints<maxFramePoints||softPoints<1||maxInFlight!==2)throw new ResourceLimit('invalid declared budgets');
  Object.assign(this,{epoch,k,softPoints,hardPoints,maxFramePoints,maxInFlight});this.pending=[];this.building=[];this.sealed=false;this.usedPoints=0;this.buildPoints=0;this.maxUsedPoints=0;this.maxGroups=0;this.nextGroup=1;this.lastToken=0;this.ackedToken=0;this.ackedControlTick=0;this.lastAckRaf=null;this.lastControlTick=0;this.lastRevision=0;this.ackedRevision=0;this.lastAckQuiet=false;this.lastBurst=null;this.lastPiece=null;this.identityState=new Map();
 }
 // HARD reservation precedes physics. It must not determine SOFT group size.
 canStep(){return !this.sealed&&this.pending.length<this.maxInFlight&&this.usedPoints+this.maxFramePoints<=this.hardPoints;}
 accept(frame,{quiet=false,burst=1,pieceId=1,revision=frame?.token,controlTick=frame?.token,removedIds=[],births=[]}={}){
  if(!validFrame(frame)||frame.token!==this.lastToken+1)throw Error('invalid frame/token order');
  if(typeof quiet!=='boolean'||!integer(burst,1)||!integer(pieceId)||!integer(revision)||!integer(controlTick,frame.token)||controlTick<=this.lastControlTick||revision<this.lastRevision||(!validIds(removedIds)||!validBirths(births)))throw Error('invalid/decreasing metadata');
  const newScope=this.lastBurst===null||burst!==this.lastBurst||pieceId!==this.lastPiece;
  if(this.lastBurst!==null&&(burst<this.lastBurst||pieceId<this.lastPiece||(burst===this.lastBurst&&pieceId!==this.lastPiece)))throw Error('invalid burst/piece transition');
  if(newScope&&(this.pending.length||this.building.length))throw Error('group boundary crossed');
  if(newScope&&this.lastBurst!==null&&!this.lastAckQuiet)throw Error('new scope requires quiet-final receipt');
  if((removedIds.length||births.length)&&!newScope)throw Error('lifecycle declaration requires new burst barrier');
  const identity=identityDelta(this.identityState,[frame],removedIds,births);if(!identity)throw Error('identity path discontinuity');
  const p=pointsIn(frame);if(p>this.maxFramePoints)throw new ResourceLimit('single frame exceeds declared bound');
  if(this.sealed||this.pending.length>=this.maxInFlight)throw new ResourceLimit('group credits exhausted');if(this.usedPoints+p>this.hardPoints)throw new ResourceLimit('hard point budget exceeded');
  if(this.building.length&&(this.buildBurst!==burst||this.buildPiece!==pieceId))throw Error('group boundary crossed');
  const emitted=[];
  // Actual size is now known. Flush the old builder if needed, but RETAIN ownership
  // of this computed frame in the bounded builder even if both delivery slots fill.
  if(this.building.length&&this.buildPoints+p>this.softPoints)emitted.push(this.flush());
  if(!this.building.length){this.buildBurst=burst;this.buildPiece=pieceId;this.buildRemovedIds=removedIds;this.buildBirths=births;}
  commitIdentity(this.identityState,identity);this.lastControlTick=controlTick;this.lastRevision=revision;this.lastBurst=burst;this.lastPiece=pieceId;
  this.building.push(frame);this.buildPoints+=p;this.usedPoints+=p;this.lastToken=frame.token;this.finalRevision=revision;this.finalControlTick=controlTick;this.finalQuiet=quiet;this.maxUsedPoints=Math.max(this.maxUsedPoints,this.usedPoints);
  this.sealed=this.building.length>=this.k||quiet||this.buildPoints>=this.softPoints||this.usedPoints+this.maxFramePoints>this.hardPoints;
  emitted.push(...this.drainReady());return emitted;
 }
 drainReady(){return this.sealed&&this.building.length&&this.pending.length<this.maxInFlight?[this.flush()]:[];}
 flush(){if(!this.building.length)return null;if(this.pending.length>=this.maxInFlight)throw new ResourceLimit('cannot flush without group credit');
  const frames=this.building;const group={births:this.buildBirths,removedIds:this.buildRemovedIds,epoch:this.epoch,burst:this.buildBurst,pieceId:this.buildPiece,revision:this.finalRevision,lastControlTick:this.finalControlTick,groupId:this.nextGroup++,firstToken:frames[0].token,lastToken:frames.at(-1).token,lastRuleTick:frames.at(-1).ruleTick,tickCount:frames.length,durationMs:frames.length*DT,quiet:this.finalQuiet,points:this.buildPoints,frames};
  this.pending.push(group);this.maxGroups=Math.max(this.maxGroups,this.pending.length);this.building=[];this.buildPoints=0;this.sealed=false;return group;
 }
 ack(a,{game=null}={}){const g=this.pending[0];if(!g||!a||a.epoch!==this.epoch||a.groupId!==g.groupId||a.lastToken!==g.lastToken||a.lastRuleTick!==g.lastRuleTick||a.burst!==g.burst||a.pieceId!==g.pieceId||a.revision!==g.revision||a.lastControlTick!==g.lastControlTick||a.lastControlTick<=this.ackedControlTick||a.revision<this.ackedRevision||a.firstToken!==this.ackedToken+1||a.firstToken!==g.firstToken||!Number.isFinite(a.raf)||(this.lastAckRaf!==null&&a.raf<=this.lastAckRaf))return false;
  if(game&&!acknowledgeGameComposite(game,g))return false;
  this.pending.shift();this.usedPoints-=g.points;this.ackedToken=g.lastToken;this.ackedControlTick=g.lastControlTick;this.ackedRevision=g.revision;this.lastAckQuiet=g.quiet;this.lastAckRaf=a.raf;return true;
 }
}
export function groupPose(group,elapsed){const result=new Map();for(const f of group.frames)for(const p of f.paths)if(!result.has(p.id))result.set(p.id,p.points.slice(0,2));for(let i=0;i<group.frames.length;i++){const alpha=Math.max(0,Math.min(1,(elapsed-i*DT)/DT));if(elapsed<i*DT)break;for(const p of group.frames[i].paths)result.set(p.id,positionOnPath(p,alpha));}return result;}
export class CompositeQueue {
 constructor(epoch=1){this.reset(epoch);}
 reset(epoch){this.epoch=epoch;this.groups=[];this.nextStart=null;this.lastAccepted=0;this.lastReceivedToken=0;this.lastReceivedRule=0;this.lastReceivedControl=0;this.lastReceivedRevision=0;this.lastDrawQuiet=false;this.identityState=new Map();this.burst=null;this.pieceId=null;this.lastAckRaf=null;this.pausedAt=null;this.endpointLedger=[];this.totalEndpoints=0;this.completedMaterialTicks=0;this.drawnControlTick=0;this.completedMaterialMs=0;this.sampledMaterialMs=0;this.starvationSuspendedMs=0;}
 accept(g,now){if(!Number.isFinite(now)||!validGroup(g)||g.epoch!==this.epoch||g.groupId!==this.lastAccepted+1||this.groups.length>=2||g.firstToken!==this.lastReceivedToken+1||g.lastControlTick<this.lastReceivedControl+g.tickCount||g.revision<this.lastReceivedRevision||(g.frames[0].ruleTick<=this.lastReceivedRule||g.frames[0].ruleTick-this.lastReceivedRule>4))return false;
  const newScope=this.burst===null||g.burst!==this.burst||g.pieceId!==this.pieceId;
  if(this.burst!==null&&(g.burst<this.burst||g.pieceId<this.pieceId||(g.burst===this.burst&&g.pieceId!==this.pieceId)))return false;
  if(newScope&&(this.groups.length||(this.burst!==null&&!this.lastDrawQuiet)))return false;if((g.removedIds.length||g.births.length)&&!newScope)return false;
  const identity=identityDelta(this.identityState,g.frames,g.removedIds,g.births);if(!identity)return false;
  const clock=this.pausedAt??now;
  if(this.burst!==g.burst||this.pieceId!==g.pieceId){if(this.groups.length)return false;this.nextStart=null;this.burst=g.burst;this.pieceId=g.pieceId;}
  // Empty-queue starvation freezes DISPLAY time. It never rebases control debt.
  if(!this.groups.length&&this.nextStart!==null&&clock>this.nextStart){this.starvationSuspendedMs+=clock-this.nextStart;this.nextStart=clock;}
  const start=this.nextStart??clock;this.groups.push({g,start});this.nextStart=start+g.durationMs;this.lastAccepted=g.groupId;this.lastReceivedToken=g.lastToken;this.lastReceivedRule=g.lastRuleTick;this.lastReceivedControl=g.lastControlTick;this.lastReceivedRevision=g.revision;commitIdentity(this.identityState,identity);return true;
 }
 setPaused(paused,now){if(paused&&this.pausedAt===null)this.pausedAt=now;else if(!paused&&this.pausedAt!==null){const delta=now-this.pausedAt;for(const x of this.groups)x.start+=delta;if(this.nextStart!==null)this.nextStart+=delta;this.pausedAt=null;}}
 draw(raf){if(!Number.isFinite(raf)||this.pausedAt!==null||!this.groups.length||(this.lastAckRaf!==null&&raf<=this.lastAckRaf))return null;const {g,start}=this.groups[0];const elapsed=Math.max(0,Math.min(g.durationMs,raf-start));const pose=groupPose(g,elapsed);this.sampledMaterialMs=this.completedMaterialMs+elapsed;const final=elapsed>=g.durationMs-1e-9;if(!final)return{final:false,pose,group:g};
  this.groups.shift();this.lastAckRaf=raf;this.completedMaterialTicks+=g.tickCount;this.drawnControlTick=g.lastControlTick;this.completedMaterialMs=this.completedMaterialTicks*DT;this.totalEndpoints++;this.lastDrawQuiet=g.quiet;
  const ack={epoch:g.epoch,burst:g.burst,pieceId:g.pieceId,revision:g.revision,lastControlTick:g.lastControlTick,groupId:g.groupId,firstToken:g.firstToken,lastToken:g.lastToken,lastRuleTick:g.lastRuleTick,raf};
  // Bounded summaries ONLY; test harness may externally collect a longer trace.
  this.endpointLedger.push({ack,poseCount:pose.size});if(this.endpointLedger.length>64)this.endpointLedger.shift();return{final:true,pose,group:g,ack};
 }
}
function acknowledgeGameComposite(game,g){if(g.firstToken!==game.presentedToken+1||g.lastToken>game.presentationToken||game.presentationTicks.get(g.lastToken)!==g.lastRuleTick)return false;game.presentedToken=g.lastToken;game.world.presentedTick=g.lastRuleTick;for(const key of game.presentationTicks.keys())if(key<=g.lastToken)game.presentationTicks.delete(key);if(g.lastToken===game.presentationToken)game.world.framePending=false;return true;}
