// This models WebGL calls and state only. Real shader compilation and GPU pixel
// readback are separate mandatory browser checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {SurfaceGPU} from '../../dist/preview/surface-gpu.js';
import {GrainRenderer} from '../../dist/preview/renderer.js';
import {Game} from '../../dist/preview/engine.js';

import {FakeGL} from './helpers/fake-gl.mjs';

const canvases=[];
function canvas(){const handlers={},context={calls:[],uploads:0,createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(im){this.uploads++;this.pixels=im.data.slice();},drawImage(source){this.calls.push(source);},strokeRect(){},setLineDash(){}};const c={style:{},width:0,height:0,context,handlers,getBoundingClientRect:()=>({width:352,height:528}),addEventListener(name,f){handlers[name]=f;},getContext(type){if(type==='webgl2')return this.gl??=new FakeGL();return context;},fire(name){handlers[name]?.({preventDefault(){}});}};canvases.push(c);return c;}
globalThis.document={createElement:canvas};globalThis.window={devicePixelRatio:2};
function makeGame(){const g=new Game({width:47,height:43,seed:31});g.state='playing';g.active=null;for(let y=8;y<35;y++)for(let x=7;x<40;x++){const i=y*g.width+x;g.grid[i]=1+(x/11|0)%3;g.material[i]=g.materialFor(x,y,412);}g.gridVersion++;return g;}
function configuredGPU(config={}){const create=globalThis.document.createElement;globalThis.document.createElement=()=>{const c=canvas();c.gl=Object.assign(new FakeGL(),config);return c;};try{return new SurfaceGPU();}finally{globalThis.document.createElement=create;}}

test('GL errors without JavaScript exceptions return CPU fallback without ending a query twice',()=>{
 const g=makeGame();for(const[method,code]of[['injectSites',1282],['injectUpload',1285],['injectShade',1282]]){const gpu=new SurfaceGPU();assert.equal(gpu.ready,true);gpu.gl[method]=code;const epoch=gpu.epoch;assert.equal(gpu.draw(g.grid,g.material,g.width,g.height),null);assert.equal(gpu.ready,false);assert.equal(gpu.epoch,epoch+1);assert.match(gpu.snapshot().reason,new RegExp(String(code)));assert.equal(gpu.gl.doubleEnd,0);assert.equal(gpu.snapshot().gpuElapsed.count,0);}
});

test('Owner passes have no active sampler feedback and share cleared strict-LESS depth',()=>{
 const g=makeGame(),gpu=new SurfaceGPU();assert(gpu.draw(g.grid,g.material,g.width,g.height,{revision:7,playing:true}));assert.equal(gpu.gl.feedback,0);assert.deepEqual(gpu.gl.trace.map(p=>p.pass),[0,1,'shade']);assert(gpu.gl.trace.slice(0,2).every(p=>p.depth===gpu.gl.LESS));assert.equal(gpu.gl.trace[0].framebuffer.depth,gpu.gl.trace[1].framebuffer.depth);assert.notEqual(gpu.gl.trace[0].framebuffer.color,gpu.gl.trace[1].framebuffer.color);assert.deepEqual(gpu.gl.clears.map(c=>[c.kind,c.value]),[['owner',[0,0,0,0]],['depth',[1]],['owner',[0,0,0,0]],['depth',[1]]]);assert.equal(gpu.gl.clears[1].framebuffer,gpu.gl.trace[0].framebuffer);assert.equal(gpu.gl.clears[3].framebuffer,gpu.gl.trace[1].framebuffer);
 for(let i=4;i<gpu.gl.instances.length;i+=4){const previous=gpu.gl.instances[i-3]*g.width+gpu.gl.instances[i-4],current=gpu.gl.instances[i+1]*g.width+gpu.gl.instances[i];assert(previous<current,'instances preserve row-major particle order');}
 assert.equal(gpu.snapshot().pending,1);gpu.gl.signaled=true;gpu.poll();assert.equal(gpu.snapshot().completed,1);assert.equal(gpu.snapshot().gpuElapsed.count,1);assert.equal(gpu.snapshot().lastCompletedRevision,7);assert.equal(gpu.snapshot().playing.gpuElapsed.count,1);
});

test('A failing GPU frame is replaced by exact CPU pixels and cached as the new backend epoch',()=>{
 const g=makeGame(),r=new GrainRenderer(canvas()),reference=new GrainRenderer(canvas(),{surfaceBackend:'cpu'});r.draw(g,{ghost:false});assert.equal(r.boardSource,r.surfaceGPU.canvas);r.surfaceGPU.gl.signaled=true;r.surfaceGPU.gl.injectShade=r.surfaceGPU.gl.INVALID_OPERATION;g.gridVersion++;r.draw(g,{ghost:false});reference.draw(g,{ghost:false});assert.equal(r.boardSource,r.buffer);assert.deepEqual(r.im.data,reference.im.data);assert.equal(r.presented.backendEpoch,r.surfaceGPU.epoch);const draws=r.canvas.context.calls.length;r.draw(g,{ghost:false});assert.equal(r.canvas.context.calls.length,draws);
});

test('Context loss falls back immediately and restoration repaints even at the same game revision',()=>{
 const g=makeGame(),r=new GrainRenderer(canvas()),reference=new GrainRenderer(canvas(),{surfaceBackend:'cpu'});r.draw(g,{ghost:false});const gpu=r.surfaceGPU,epoch=gpu.epoch;assert.equal(gpu.snapshot().pending,1);gpu.canvas.fire('webglcontextlost');r.draw(g,{ghost:false});reference.draw(g,{ghost:false});assert.equal(gpu.epoch,epoch+1);assert.equal(gpu.snapshot().cancelledMeasurements,1);assert.equal(r.boardSource,r.buffer);assert.deepEqual(r.im.data,reference.im.data);gpu.canvas.fire('webglcontextrestored');r.draw(g,{ghost:false});assert.equal(gpu.ready,true);assert.equal(r.boardSource,gpu.canvas);assert.equal(r.presented.backendEpoch,gpu.epoch);
});

test('Missing or failed fences are accounted for and cannot silently drop completion evidence',()=>{
 const g=makeGame();for(const config of[{nullFence:true},{injectFence:1285}]){const gpu=configuredGPU(config);assert.equal(gpu.draw(g.grid,g.material,g.width,g.height,{revision:11}),null);const s=gpu.snapshot();assert.equal(s.backend,'cpu-fallback');assert.equal(s.submissions,1);assert.equal(s.completed,0);assert.equal(s.pending,0);assert.equal(s.cancelledMeasurements,1);assert.match(s.reason,/completion fence failed/);assert.equal(gpu.gl.doubleEnd,0);}
});

test('Native WAIT_FAILED status releases pending work once and repaints CPU at the unchanged revision',()=>{
 for(const disjoint of[false,true]){
  const g=makeGame(),r=new GrainRenderer(canvas()),reference=new GrainRenderer(canvas(),{surfaceBackend:'cpu'});r.draw(g,{ghost:false});
  const gpu=r.surfaceGPU,gl=gpu.gl;gl.signaled=true;r.draw(g,{ghost:false});assert.equal(gpu.snapshot().completed,1);assert.equal(gpu.snapshot().pending,0);
  gl.signaled=false;g.gridVersion++;r.draw(g,{ghost:false});
  // Retain one unavailable optional query after its fence completes, then
  // submit the next frame: two records, but only one live command fence.
  const getQueryParameter=gl.getQueryParameter.bind(gl);gl.getQueryParameter=(q,key)=>key===gl.QUERY_RESULT_AVAILABLE?false:getQueryParameter(q,key);gl.signaled=true;gpu.poll();gl.signaled=false;g.gridVersion++;r.draw(g,{ghost:false});assert.equal(gpu.pending.length,2);assert.equal(gpu.pending.filter(p=>p.fence).length,1);
  const revision=g.gridVersion,before=gpu.snapshot(),expected=[...gpu.resources,...gpu.targets,...gpu.pending.flatMap(p=>[['Sync',p.fence],['Query',p.query]])].filter(([,handle])=>handle),deleted=new Map();
  for(const kind of new Set(expected.map(([kind])=>kind))){const name='delete'+kind,original=gl[name].bind(gl);gl[name]=handle=>{const count=(deleted.get(handle)||0)+1;deleted.set(handle,count);assert.equal(count,1,`${name} must release each handle only once`);return original(handle);};}
  // Match native failure semantics: return WAIT_FAILED without throwing,
  // setting a GL error, changing the context state or advancing the game.
  let waits=0;gl.disjoint=disjoint;gl.clientWaitSync=()=>{waits++;return gl.WAIT_FAILED;};assert.equal(gl.getError(),gl.NO_ERROR);assert.equal(gl.isContextLost(),false);
  r.draw(g,{ghost:false});reference.draw(g,{ghost:false});const after=r.backendSnapshot();
  assert.equal(waits,1,'poll must stop immediately after fail releases the whole queue');assert.equal(after.backend,'cpu-fallback');assert.match(after.reason,/WAIT_FAILED/);assert.equal(after.epoch,before.epoch+1);assert.equal(after.pending,0);assert.equal(after.cancelledMeasurements,before.cancelledMeasurements+2);
  assert.equal(after.completed,before.completed);assert.equal(after.gpuElapsed.count,before.gpuElapsed.count);assert.equal(after.completionObservedWall.count,before.completionObservedWall.count);assert.equal(after.lastCompletedRevision,before.lastCompletedRevision);assert.equal(after.playing.completionObservedWall.count,before.playing.completionObservedWall.count);
  for(const[,handle]of expected)assert.equal(deleted.get(handle),1,'all pending fence/query and GL resource handles must be released');assert.equal(gpu.resources.length,0);assert.equal(gpu.targets.length,0);assert.equal(gl.livePrograms.size,0);
  assert.equal(g.gridVersion,revision);assert.equal(r.boardSource,r.buffer);assert.deepEqual(r.im.data,reference.im.data);assert.equal(r.presented.backendEpoch,after.epoch);assert.equal(gl.isContextLost(),false);assert.equal(gl.getError(),gl.NO_ERROR);
  const draws=r.canvas.context.calls.length,deletes=deleted.size;r.draw(g,{ghost:false});assert.equal(r.canvas.context.calls.length,draws);assert.equal(deleted.size,deletes);assert.equal(waits,1,'cached CPU redraw must not poll or delete the failed backend again');
 }
});

test('Insufficient fragment precision or depth precision explicitly rejects the GPU backend',()=>{
 const g=makeGame(),lowFloat=configuredGPU({precision:16});assert.equal(lowFloat.ready,false);assert.match(lowFloat.snapshot().reason,/fragment precision/);const lowDepth=configuredGPU({depthBits:24});assert.equal(lowDepth.ready,true);assert.equal(lowDepth.draw(g.grid,g.material,g.width,g.height),null);assert.equal(lowDepth.ready,false);assert.match(lowDepth.snapshot().reason,/float depth/);
});

test('A later shader compilation failure releases programs created earlier during initialization',()=>{
 const gpu=configuredGPU({failShadeCompile:true});assert.equal(gpu.ready,false);assert.equal(gpu.gl.livePrograms.size,0);assert.match(gpu.snapshot().reason,/compilation rejected/);
});

test('Missing timer queries and disjoint timing never manufacture GPU elapsed results',()=>{
 const g=makeGame(),withoutTimer=configuredGPU({noTimer:true});assert(withoutTimer.draw(g.grid,g.material,g.width,g.height));withoutTimer.gl.signaled=true;withoutTimer.poll();assert.equal(withoutTimer.snapshot().completed,1);assert.equal(withoutTimer.snapshot().gpuElapsed.count,0);
 const disjoint=new SurfaceGPU();assert(disjoint.draw(g.grid,g.material,g.width,g.height));disjoint.gl.disjoint=true;disjoint.gl.signaled=true;disjoint.poll();assert.equal(disjoint.snapshot().completed,1);assert.equal(disjoint.snapshot().gpuElapsed.count,0);assert.equal(disjoint.snapshot().disjointQueries,1);
});

test('Pending surface commands are bounded before upload and deferred requests keep only latest metadata',()=>{
 const g=makeGame(),gpu=new SurfaceGPU();assert(gpu.draw(g.grid,g.material,g.width,g.height,{revision:0}));const trace=gpu.gl.trace.length,data=gpu.gridData.slice();
 for(let i=1;i<=100;i++){g.grid[0]=i%4;assert.equal(gpu.draw(g.grid,g.material,g.width,g.height,{revision:i,tick:i}),null);assert.equal(gpu.lastOutcome,'deferred');}
 const s=gpu.snapshot();assert.equal(s.submissions,1);assert.equal(s.pending,1);assert.equal(s.inFlightSubmissions,1);assert.equal(s.maxInFlightSubmissions,1);assert.equal(s.deferredRequests,100);assert.equal(s.coalescedVisualRequests,99);assert.equal(s.lastRequested.revision,100);assert.equal(gpu.gl.trace.length,trace);assert.deepEqual(gpu.gridData,data);
 gpu.gl.signaled=true;assert(gpu.draw(g.grid,g.material,g.width,g.height,{revision:100,tick:100}));assert.equal(gpu.snapshot().submissions,2);assert.equal(gpu.snapshot().completed,1);assert.equal(gpu.gridData[0],g.grid[0]);gpu.poll();assert.equal(gpu.snapshot().completed,2);assert.equal(gpu.snapshot().pending,0);assert.equal(gpu.snapshot().lastCompletedRevision,100);
});

test('Unavailable optional timer queries stay bounded without blocking mandatory completion fences',()=>{
 const g=makeGame(),gpu=new SurfaceGPU(),gl=gpu.gl;gl.signaled=true;gl.getQueryParameter=()=>false;
 for(let i=0;i<100;i++){assert(gpu.draw(g.grid,g.material,g.width,g.height,{revision:i}));assert.equal(gpu.pending.filter(p=>p.fence).length,1);assert(gpu.pending.filter(p=>p.query).length<=64);assert(gpu.pending.length<=65);}
 let s=gpu.snapshot();assert.equal(s.submissions,100);assert.equal(s.completed,99);assert.equal(s.inFlightSubmissions,1);assert.equal(s.maxInFlightSubmissions,1);assert.equal(s.skippedMeasurements,36);assert.equal(s.gpuElapsed.count,0);gpu.poll();s=gpu.snapshot();assert.equal(s.completed,100);assert.equal(s.inFlightSubmissions,0);assert.equal(s.pending,64);assert.equal(s.lastCompletedRevision,99);
 gl.disjoint=true;gpu.poll();assert.equal(gpu.snapshot().pending,0);assert.equal(gpu.snapshot().disjointQueries,64);assert.equal(gpu.snapshot().gpuElapsed.count,0);
});
