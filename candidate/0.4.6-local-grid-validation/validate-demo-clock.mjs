// Node-only mocked DOM/canvas test of scheduler logic. This is NOT browser QA.
import assert from 'node:assert/strict';
let wallMs=0,callback=null,polygonFills=0;const elements=new Map();
const ctx=new Proxy({fill(){polygonFills++;}},{get:(o,k)=>o[k]??(()=>{})});
const element=id=>{if(!elements.has(id))elements.set(id,{id,textContent:'',style:{},width:576,height:864,getContext:()=>ctx});return elements.get(id);};
const original={document:globalThis.document,window:globalThis.window,requestAnimationFrame:globalThis.requestAnimationFrame,performance:globalThis.performance};
try{
 globalThis.document={getElementById:element,documentElement:{dataset:{}}};globalThis.window={};globalThis.requestAnimationFrame=fn=>{callback=fn;return 1;};Object.defineProperty(globalThis,'performance',{value:{now:()=>wallMs},configurable:true});
 await import('./demo.mjs');const api=window.__LOCAL_SAND_QA;
 assert.equal(api.telemetry().pendingFeed,256);assert.equal(api.telemetry().live,0);
 const frame=t=>{wallMs=t;const run=callback;callback=null;run(t);assert.ok(callback);};
 frame(0);const fillBefore=polygonFills;frame(1000);let s=api.telemetry();assert.equal(s.tick,12);assert.ok(Math.abs(s.accumulatorSeconds-.9)<1e-10);assert.equal(s.overloaded,true);assert.equal(polygonFills-fillBefore,s.live,'Every actual live grain is drawn once on a changed frame');
 wallMs=1050;api.pause(true);s=api.telemetry();assert.ok(Math.abs(s.accumulatorSeconds-.95)<1e-10);
 frame(6050);assert.equal(api.telemetry().tick,12);assert.ok(Math.abs(api.telemetry().accumulatorSeconds-.95)<1e-10);
 api.pause(false);frame(6100);s=api.telemetry();assert.equal(s.tick,24);assert.ok(Math.abs(s.simulationSeconds+s.accumulatorSeconds-1.1)<1e-10,'Active wall time must equal executed fixed time plus retained debt');
 api.artificialBridge();assert.equal(api.telemetry().live,132);assert.equal(api.telemetry().artificialFixture,true);const c=api.clearConnected();assert.equal(c.removed,132);assert.equal(api.telemetry().conservation,true);
 api.startScene(4056,{paused:true});assert.equal(api.telemetry().pendingFeed,4056);assert.equal(api.telemetry().live,0);assert.equal(api.telemetry().accumulatorSeconds,0);assert.throws(()=>api.queue(1,{color:0}));
 console.log(JSON.stringify({passed:true,kind:'Node mocked-DOM scheduler/control unit check only',browserExecuted:false,renderAppearanceVerified:false,oneSecondDebtPreserved:true,pauseBoundaryDebtPreserved:true,actualGrainDrawCountPreserved:true,artificialConnectedClear:132}));
}finally{for(const key of['document','window','requestAnimationFrame'])if(original[key]===undefined)delete globalThis[key];else globalThis[key]=original[key];Object.defineProperty(globalThis,'performance',{value:original.performance,configurable:true});}
