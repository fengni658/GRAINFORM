import {CompositeQueue,groupPose,pointsIn} from './composite-protocol.mjs';
const overlay=g=>{const ids=new Map();for(const f of g.frames)for(const p of f.paths)if(!ids.has(p.id))ids.set(p.id,{id:p.id,points:p.points.slice(0,2)});return{token:g.lastToken,paths:[...ids.values()]};};
// Real renderer-facing interface: sample NEVER completes a group. didDraw is called
// only after CALayerRenderer.draw returned successfully, with the same rAF stamp.
export class CompositePresentation {
 constructor(){this.core=new CompositeQueue();this.sampledAt=null;this.sampledGroup=null;this.paintReceipts=0;this.maxPoints=0;this.overlays=new Map();}
 reset(epoch){this.core.reset(epoch);this.sampledAt=null;this.sampledGroup=null;this.overlays.clear();}
 get epoch(){return this.core.epoch;}get pausedAt(){return this.core.pausedAt;}
 get queue(){return this.core.groups.map(({g})=>{if(!this.overlays.has(g.groupId))this.overlays.set(g.groupId,overlay(g));return this.overlays.get(g.groupId);});}
 invalidateContinuity(){this.sampledAt=null;this.sampledGroup=null;}
 setContinuity(){/* Scope/quiet/epoch are validated by group admission. */}
 setPaused(paused,now){this.core.setPaused(paused,now);this.invalidateContinuity();}
 accept(epoch,groups,now){if(epoch<this.epoch)return false;if(epoch!==this.epoch)this.reset(epoch);for(const g of groups){if(g.lastToken<=this.core.completedMaterialTicks||g.groupId<=this.core.lastAccepted)continue;if(!this.core.accept(g,now))throw Error('Composite presentation packet rejected');}this.maxPoints=Math.max(this.maxPoints,this.points());return true;}
 restore(checkpoint,groups,now){this.reset(checkpoint.epoch);Object.assign(this.core,{lastAccepted:checkpoint.groupId,lastReceivedToken:checkpoint.token,lastReceivedRule:checkpoint.ruleTick,lastReceivedControl:checkpoint.controlTick,lastReceivedRevision:checkpoint.revision,completedMaterialTicks:checkpoint.token,completedMaterialMs:checkpoint.token*1000/60,drawnControlTick:checkpoint.controlTick,burst:checkpoint.burst,pieceId:checkpoint.pieceId,lastDrawQuiet:checkpoint.quiet});this.accept(checkpoint.epoch,groups,now);}
 sample(now){const first=this.core.groups[0];this.sampledAt=now;this.sampledGroup=first?.g.groupId??null;if(!first)return null;const t=this.pausedAt??now,elapsed=Math.max(0,Math.min(first.g.durationMs,t-first.start));return{frame:{token:first.g.lastToken},alpha:elapsed/first.g.durationMs,positions:[...groupPose(first.g,elapsed)].map(([id,xy])=>({id,xy})),displayQueue:this.queue};}
 didDraw(raf){if(raf!==this.sampledAt||this.sampledGroup!==this.core.groups[0]?.g.groupId)return null;const d=this.core.draw(raf);this.sampledAt=null;if(!d?.ack)return null;this.overlays.delete(d.group.groupId);this.paintReceipts++;return d.ack;}
 points(){return this.core.groups.reduce((n,{g})=>n+g.frames.reduce((s,f)=>s+pointsIn(f),0),0);}
 read(){return{protocol:'composite-K4-final-endpoint',epoch:this.epoch,pending:this.core.groups.length,tokens:this.core.groups.map(x=>x.g.lastToken),paused:this.pausedAt!==null,paintReceipts:this.paintReceipts,pendingPathPoints:this.points(),maxPathPoints:this.maxPoints,drawnMaterialTicks:this.core.completedMaterialTicks,drawnControlTick:this.core.drawnControlTick,starvationSuspendedMs:this.core.starvationSuspendedMs};}
}
