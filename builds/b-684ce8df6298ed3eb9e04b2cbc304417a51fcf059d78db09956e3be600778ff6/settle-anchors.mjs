// 0.5.1: no post-physics visual relocation. Per-ID appearance is fixed by
// materialStyle. Keep a bounded paint transaction so failed draws never ACK.
export const ANCHOR_SETTLE_MS=0;
export class SettleAnchors{
 constructor(){this.epoch=null;this.pending=null;this.paused=false;this.stage=null;this.live=new Set;this.metrics={targetSamples:0,commits:0,aborts:0,maxParticipants:0,fastStages:0,interleavedStages:0,eligibilityScans:0,fastResyncFallbacks:0};}
 reset(epoch){if(epoch===this.epoch)return;this.epoch=epoch;this.pending=null;this.live.clear();}
 setPaused(paused){this.paused=paused;}
 observePatch(epoch,patch){this.reset(epoch);if(patch.reset)this.live.clear();for(const id of patch.removed)this.live.delete(id);for(const b of patch.upsert)this.live.add(b.id);}
 prepare(r,{now}){if(this.pending)throw Error('unresolved paint transaction');r.setAnchorMoving(null);this.pending={now};return{participants:0,remaining:0,dt:0};}
 commit(){if(!this.pending)throw Error('no paint transaction');this.pending=null;this.metrics.commits++;}
 abort(){if(!this.pending)return;this.pending=null;this.metrics.aborts++;}
 readyForReceipt(){return !this.pending;}
 read(){return{epoch:this.epoch,live:this.live.size,dirty:0,participants:0,remainingMs:0,pendingDraw:!!this.pending,...this.metrics};}
}
