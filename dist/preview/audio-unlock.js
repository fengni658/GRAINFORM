// The constructor and resume() stay inside the calling user gesture.
// No audio is created while muted; no audio Promise is awaited by gameplay.
export class AudioUnlock {
  constructor({createContext,diagnostics=false,now=()=>performance.now(),activation=()=>null}={}){
    this.createContext=createContext;this.activation=activation;this.diagnostics=diagnostics;this.now=now;this.context=null;this.pending=null;this.revision=0;this.serial=0;this.records=[];
    this.counts={requests:0,mutedSkips:0,runningSkips:0,pendingSkips:0,pendingRetries:0,constructorCalls:0,constructorErrors:0,resumeCalls:0,resumeSyncErrors:0,resumeRejected:0,resumeResolved:0};
    this.max={constructorSyncMs:0,resumeSyncMs:0,resumePromiseElapsedMs:0};this.lastConstructor=null;this.lastResume=null;
  }
  retain(record){if(!this.diagnostics)return;this.records.push(record);if(this.records.length>24)this.records.shift();this.revision++;}
  unlock(enabled,source='input',{retryPending=false}={}){
    this.counts.requests++;
    if(!enabled){this.counts.mutedSkips++;return this.context;}
    if(!this.context){
      this.counts.constructorCalls++;const before=this.diagnostics?this.now():0;let error=null,threw=false;
      try{this.context=this.createContext();}catch(e){error=e;threw=true;this.counts.constructorErrors++;}
      if(this.diagnostics){const after=this.now(),record={id:++this.serial,kind:'constructor',source,beforeAtMs:before,afterAtMs:after,syncWallMs:after-before,outcome:threw?'error':'returned',stateAfter:this.context?.state||'not-created',errorName:threw?(error?.name||'Error'):null};this.lastConstructor=record;this.max.constructorSyncMs=Math.max(this.max.constructorSyncMs,record.syncWallMs);this.retain(record);}
      if(!this.context)return null;
    }
    const context=this.context;
    if(context.state==='running'){this.counts.runningSkips++;return context;}
    if(context.state!=='suspended')return context;
    let active=null;try{const value=this.activation();if(typeof value==='boolean')active=value;}catch{}
    let retryReason=null;
    if(this.pending){
      const becameActive=this.pending.activation===false&&active===true;
      if(!retryPending&&!becameActive){this.counts.pendingSkips++;return context;}
      retryReason=retryPending?'explicit-request':'became-active';this.counts.pendingRetries++;
    }
    this.counts.resumeCalls++;
    const before=this.diagnostics?this.now():0;
    const record=this.diagnostics?{id:++this.serial,kind:'resume',source,retryReason,userActivationAtCall:active,stateBefore:context.state,beforeAtMs:before,afterAtMs:null,syncWallMs:null,promiseSettledAtMs:null,promiseElapsedMs:null,promiseWaitAfterReturnMs:null,outcome:'pending',stateAfter:null,errorName:null}:null;
    const token={record,activation:active};this.pending=token;
    let promise;
    try{promise=context.resume();}catch(e){
      this.counts.resumeSyncErrors++;this.pending=null;
      if(record){const after=this.now();Object.assign(record,{afterAtMs:after,syncWallMs:after-before,outcome:'sync-error',stateAfter:context.state,errorName:e?.name||'Error'});this.lastResume=record;this.max.resumeSyncMs=Math.max(this.max.resumeSyncMs,record.syncWallMs);this.retain(record);}
      return context;
    }
    if(record){const after=this.now();Object.assign(record,{afterAtMs:after,syncWallMs:after-before,stateAfter:context.state});this.lastResume=record;this.max.resumeSyncMs=Math.max(this.max.resumeSyncMs,record.syncWallMs);this.retain(record);}
    // Register both fulfillment and rejection handlers immediately; an audio failure
    // clears the guard so a later user gesture may retry without blocking the game.
    Promise.resolve(promise).then(()=>this.settle(token,context,true,null),error=>this.settle(token,context,false,error));
    return context;
  }
  settle(token,context,success,error){
    if(this.pending===token)this.pending=null;
    if(!success)this.counts.resumeRejected++;else this.counts.resumeResolved++;
    if(token.record){const at=this.now(),r=token.record;Object.assign(r,{promiseSettledAtMs:at,promiseElapsedMs:at-r.beforeAtMs,promiseWaitAfterReturnMs:at-r.afterAtMs,outcome:success?'resolved':'rejected',stateOnSettlement:context.state,errorName:success?null:(error?.name||'Error')});this.max.resumePromiseElapsedMs=Math.max(this.max.resumePromiseElapsedMs,r.promiseElapsedMs);this.revision++;}
  }
  snapshot({detail=false}={}){
    const result={pendingResume:!!this.pending,outstandingResumePromises:this.counts.resumeCalls-this.counts.resumeSyncErrors-this.counts.resumeRejected-this.counts.resumeResolved,contextState:this.context?.state||'not-created',counts:{...this.counts},max:{...this.max},lastConstructor:this.lastConstructor?{...this.lastConstructor}:null,lastResume:this.lastResume?{...this.lastResume}:null};
    if(detail)result.recentAttempts=this.records.map(r=>({...r}));return result;
  }
}

// Startup wall time is separate from RAF work. First draw completion is NOT GPU
// presentation time, and neither interval is substituted for the other.
export class StartDiagnostics {
  constructor({enabled=false,now=()=>performance.now()}={}){this.enabled=enabled;this.now=now;this.serial=0;this.revision=0;this.records=[];this.latest=null;this.maxHandlerMs=0;this.maxToFirstDrawMs=0;}
  begin(event,soundEnabled){
    if(!this.enabled)return null;const at=this.now(),eventAt=Number.isFinite(event?.timeStamp)&&event.timeStamp>=0&&event.timeStamp<=at?event.timeStamp:null;
    const record={id:++this.serial,trigger:event?.type||'programmatic',soundEnabled,eventAtMs:eventAt,handlerBeginAtMs:at,audioBeforeAtMs:null,audioAfterAtMs:null,audioSyncWallMs:null,handlerEndAtMs:null,handlerSyncWallMs:null,firstPlayingRafAtMs:null,firstPlayingCallbackAtMs:null,firstPlayingDrawCompletedAtMs:null,handlerToFirstDrawMs:null,eventToFirstDrawMs:null};
    this.latest=record;this.records.push(record);if(this.records.length>16)this.records.shift();this.revision++;return record;
  }
  beforeAudio(record){if(record)record.audioBeforeAtMs=this.now();}
  afterAudio(record){if(record){record.audioAfterAtMs=this.now();record.audioSyncWallMs=record.audioAfterAtMs-record.audioBeforeAtMs;}}
  finish(record){if(record){record.handlerEndAtMs=this.now();record.handlerSyncWallMs=record.handlerEndAtMs-record.handlerBeginAtMs;this.maxHandlerMs=Math.max(this.maxHandlerMs,record.handlerSyncWallMs);this.revision++;}}
  noteDraw(rafAt,callbackAt,drawCompletedAt){
    const r=this.latest;if(!r||r.firstPlayingDrawCompletedAtMs!==null)return;
    Object.assign(r,{firstPlayingRafAtMs:rafAt,firstPlayingCallbackAtMs:callbackAt,firstPlayingDrawCompletedAtMs:drawCompletedAt,handlerToFirstDrawMs:drawCompletedAt-r.handlerBeginAtMs,eventToFirstDrawMs:r.eventAtMs===null?null:drawCompletedAt-r.eventAtMs});
    this.maxToFirstDrawMs=Math.max(this.maxToFirstDrawMs,r.handlerToFirstDrawMs);this.revision++;
  }
  snapshot({detail=false}={}){const result={measurement:'Wall time. Start handler includes synchronous audio setup. First playing draw completed means Canvas calls returned, not GPU presentation or audible output.',starts:this.serial,maxHandlerSyncMs:this.maxHandlerMs,maxHandlerToFirstDrawMs:this.maxToFirstDrawMs,latest:this.latest?{...this.latest}:null};if(detail)result.recentStarts=this.records.map(r=>({...r}));return result;}
}
