// Layer/queue lifecycle models only. These tests do not execute shaders, verify
// compositor scaling, or establish paint/input latency or browser performance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {GrainRenderer} from '../../dist/preview/renderer.js';
import {Game,SHAPES} from '../../dist/preview/engine.js';
import {FakeGL} from './helpers/fake-gl.mjs';

function canvas(config={}){
 const handlers={},attrs={},ctx={calls:[],composition:[],uploads:0,clears:0,
  createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),
  putImageData(im){this.uploads++;this.pixels=im.data.slice();},
  clearRect(...geometry){this.clears++;this.composition=[];this.calls.push({type:'clear',geometry});},
  drawImage(source,...geometry){const call={type:'image',source,geometry};this.calls.push(call);this.composition.push(call);},
  strokeRect(...geometry){const call={type:'stroke',geometry};this.calls.push(call);this.composition.push(call);},setLineDash(){}};
 return {style:{},attrs,width:0,height:0,context:ctx,handlers,rect:{width:352,height:528},
  getBoundingClientRect(){return this.rect;},setAttribute(k,v){attrs[k]=v;},addEventListener(k,f){handlers[k]=f;},
  getContext(type,options){if(type==='webgl2'){if(config.unavailable)return null;return this.gl??=Object.assign(new FakeGL(),config);}this.contextOptions??=options;return ctx;},
  fire(name){let prevented=false;handlers[name]?.({preventDefault(){prevented=true;}});return prevented;}};
}
function setup(config={}){
 globalThis.window={devicePixelRatio:2};globalThis.document={createElement:()=>canvas(config)};
 const main=canvas(),host={id:'boardShell',children:[main],insertBefore(node,before){const existing=this.children.indexOf(node);if(existing>=0)this.children.splice(existing,1);this.children.splice(this.children.indexOf(before),0,node);node.parentElement=this;}};main.parentElement=host;
 return {main,host,r:new GrainRenderer(main,{directDisplay:true})};
}
function game(seed=31){const g=new Game({width:47,height:43,seed});g.state='playing';g.active={shape:SHAPES[1],color:2,x:2,y:0,materialSeed:seed};for(let y=26;y<40;y++)for(let x=3;x<44;x++){const i=y*g.width+x;g.grid[i]=1+(x/15|0)%3;g.material[i]=g.materialFor(x,y,412);}g.gridVersion++;return g;}
function makeVisible(s,g,options={}){s.r.draw(g,options);const gpu=s.r.surfaceGPU;assert.equal(s.r.layerVisible,false);gpu.gl.signaled=true;s.r.draw(g,options);assert.equal(s.r.layerVisible,true);gpu.gl.signaled=false;return gpu;}
function boardImages(s){return s.main.context.calls.filter(c=>c.type==='image'&&c.source===s.r.buffer);}
function assertNoGPUCopy(s){assert(!s.main.context.calls.some(c=>c.type==='image'&&c.source===s.r.surfaceGPU?.canvas),'direct display must never copy WebGL into Canvas2D');}
function physics(g){return {grid:g.grid.slice(),material:g.material.slice(),mask:g.clearMask.slice(),tick:g.tick,revision:g.gridVersion,generation:g.generation,added:g.added,removed:g.removed,state:g.state};}

test('Direct layer mounts once behind the transparent focus canvas and preserves fixed framebuffer and overlay order',()=>{
 const s=setup(),g=game(),gpu=makeVisible(s,g,{ghost:true});assert.equal(s.main.contextOptions.alpha,true);assert.deepEqual(s.host.children,[gpu.canvas,s.main]);assert.equal(gpu.canvas.attrs['aria-hidden'],'true');assert.equal(gpu.canvas.tabIndex,-1);assert.equal(gpu.canvas.style.pointerEvents,'none');assert.equal(gpu.canvas.style.position,'absolute');assert.equal(gpu.canvas.style.inset,'0');assert.equal(gpu.canvas.style.width,'100%');assert.equal(gpu.canvas.style.height,'100%');assert.equal(gpu.canvas.style.zIndex,'0');assert.equal(s.main.style.position,'relative');assert.equal(s.main.style.zIndex,'0');assert.equal(gpu.canvas.width,g.width*2);assert.equal(gpu.canvas.height,g.height*2);assert.equal(gpu.canvas.style.display,'block');assertNoGPUCopy(s);
 const clears=s.main.context.clears,submissions=gpu.submissions;s.r.draw(g,{ghost:true});assert.equal(s.main.context.clears,clears);assert.equal(gpu.submissions,submissions);assert.equal(s.host.children.length,2);
});

test('Busy GPU coalesces board revisions while the active piece and ghost keep redrawing without mutating physics',()=>{
 const s=setup(),g=game(),gpu=makeVisible(s,g);g.gridVersion++;s.r.draw(g);const accepted=gpu.submissions,trace=gpu.gl.trace.length,uploaded=gpu.gridData.slice(),cpuUploads=s.r.pctx.uploads,clears=s.main.context.clears;
 let options={ghost:true};for(let i=0;i<100;i++){g.tick++;g.gridVersion++;g.grid[i]=1+i%3;g.material[i]=i;g.active={...g.active,x:2+i%5};options={ghost:true,contrast:i>90,motion:false};if(i>94){g.clearTimer=5;g.clearMask[i]=1;}const before=physics(g);s.r.draw(g,options);assert.deepEqual(physics(g),before);}
 assert.equal(gpu.submissions,accepted);assert.equal(gpu.gl.trace.length,trace);assert.deepEqual(gpu.gridData,uploaded);assert.equal(gpu.pending.filter(p=>p.fence).length,1);assert.equal(gpu.snapshot().maxInFlightSubmissions,1);assert.equal(s.r.pctx.uploads,cpuUploads);assert.equal(s.r.layerVisible,true);assert.equal(s.main.context.clears,clears+100);assert.equal(s.r.lastRevision,g.gridVersion-100);assert(s.main.context.composition.some(c=>c.type==='stroke'));assertNoGPUCopy(s);
 gpu.gl.signaled=true;s.r.draw(g,options);assert.equal(gpu.submissions,accepted+1);assert.equal(gpu.lastSubmitted.revision,g.gridVersion);assert.equal(gpu.lastRequested.tick,g.tick);assert.equal(s.r.lastRevision,g.gridVersion);for(let i=0;i<g.size;i++){assert.equal(gpu.gridData[i*4],g.grid[i]);assert.equal(gpu.gridData[i*4+1],g.material[i]);assert.equal(gpu.gridData[i*4+2],g.clearMask[i]);}assert.equal(gpu.paletteContrast,true);assertNoGPUCopy(s);
});

test('The final deferred revision submits after completion even if paused and no visual input changes again',()=>{
 const s=setup(),g=game(),gpu=makeVisible(s,g,{ghost:false});g.gridVersion++;s.r.draw(g,{ghost:false});const accepted=gpu.submissions;g.gridVersion+=17;g.grid[100]=3;g.material[100]=179;g.state='paused';s.r.draw(g,{ghost:false,contrast:true});assert.equal(gpu.submissions,accepted);assert.equal(s.r.layerDeferred,true);
 const before=physics(g);gpu.gl.signaled=true;s.r.draw(g,{ghost:false,contrast:true});assert.equal(gpu.submissions,accepted+1);assert.equal(gpu.lastSubmitted.revision,g.gridVersion);assert.equal(gpu.gridData[400],3);assert.equal(gpu.gridData[401],179);assert.deepEqual(physics(g),before);gpu.poll();assert.equal(gpu.lastCompleted.revision,g.gridVersion);
});

test('A new Game with the same revision hides old in-flight pixels and releases its CPU cover only on its own completion',()=>{
 const s=setup(),a=game(),gpu=makeVisible(s,a,{ghost:false});a.gridVersion++;s.r.draw(a,{ghost:false});const oldToken=s.r.layerSession,oldSubmissions=gpu.submissions,b=game(78);b.gridVersion=a.gridVersion;b.grid.fill(0);b.material.fill(0);b.grid[321]=3;b.material[321]=213;
 s.r.draw(b,{ghost:false});assert.notEqual(s.r.layerSession,oldToken);assert.equal(gpu.submissions,oldSubmissions);assert.equal(s.r.layerVisible,false);assert.equal(gpu.canvas.style.display,'none');assert.equal(boardImages(s).at(-1).source,s.r.buffer);const covered=s.r.im.data.slice(),uploads=s.r.pctx.uploads;
 b.active={...b.active,x:3};s.r.draw(b,{ghost:false});assert.equal(s.r.pctx.uploads,uploads);assert.deepEqual(s.r.im.data,covered);assert.equal(s.main.context.composition[0].source,s.r.buffer);
 gpu.gl.signaled=true;s.r.draw(b,{ghost:false});assert.equal(gpu.submissions,oldSubmissions+1);assert.equal(s.r.layerVisible,false);assert.equal(gpu.lastCompleted.generation,oldToken);assert.equal(gpu.lastSubmitted.generation,s.r.layerSession);
 const clears=s.main.context.clears;s.r.draw(b,{ghost:false});assert.equal(s.r.layerVisible,true);assert.equal(gpu.canvas.style.display,'block');assert.equal(s.main.context.clears,clears+1);assert(!s.main.context.composition.some(c=>c.source===s.r.buffer));assertNoGPUCopy(s);
});

test('Restart on the same model and same numeric revision uses the explicit generation to invalidate old GPU work',()=>{
 const s=setup(),g=game(),gpu=makeVisible(s,g,{ghost:false,generation:11});g.gridVersion++;s.r.draw(g,{ghost:false,generation:11});const oldToken=s.r.layerSession,oldSubmissions=gpu.submissions;g.grid.fill(0);g.material.fill(0);s.r.lastRevision=-1;
 s.r.draw(g,{ghost:false,generation:12});assert.equal(gpu.submissions,oldSubmissions);assert.equal(s.r.layerSession,oldToken+1);assert.equal(s.r.layerVisible,false);assert.equal(gpu.canvas.style.display,'none');gpu.gl.signaled=true;s.r.draw(g,{ghost:false,generation:12});assert.equal(s.r.layerVisible,false);s.r.draw(g,{ghost:false,generation:12});assert.equal(s.r.layerVisible,true);assert.equal(gpu.lastCompleted.generation,oldToken+1);assert(gpu.gridData.every((v,i)=>i%4===3||v===0));assertNoGPUCopy(s);
});

test('Resizing a busy foreground preserves the fixed GPU raster and still submits the latest pending board',()=>{
 const s=setup(),g=game(),gpu=makeVisible(s,g,{ghost:false});g.gridVersion++;s.r.draw(g,{ghost:false});const dims=[gpu.canvas.width,gpu.canvas.height],accepted=gpu.submissions;g.gridVersion++;s.main.rect={width:301,height:451.5};s.r.resize();s.r.draw(g,{ghost:false});assert.deepEqual([s.main.width,s.main.height],[602,903]);assert.deepEqual([gpu.canvas.width,gpu.canvas.height],dims);assert.equal(gpu.submissions,accepted);assert.deepEqual(s.main.context.calls.filter(c=>c.type==='clear').at(-1).geometry,[0,0,602,903]);gpu.gl.signaled=true;s.r.draw(g,{ghost:false});assert.equal(gpu.submissions,accepted+1);assert.equal(gpu.lastSubmitted.revision,g.gridVersion);assert.deepEqual([gpu.canvas.width,gpu.canvas.height],dims);assertNoGPUCopy(s);
});

test('WAIT_FAILED immediately hides the visible GPU layer and draws exact CPU pixels at the unchanged revision',()=>{
 const s=setup(),g=game(),gpu=makeVisible(s,g,{ghost:false});g.gridVersion++;s.r.draw(g,{ghost:false});const epoch=gpu.epoch,revision=g.gridVersion,completed=gpu.completed;gpu.gl.clientWaitSync=()=>gpu.gl.WAIT_FAILED;s.r.draw(g,{ghost:false});
 const ref=new GrainRenderer(canvas(),{surfaceBackend:'cpu'});ref.draw(g,{ghost:false});assert.equal(gpu.ready,false);assert.equal(gpu.epoch,epoch+1);assert.equal(gpu.completed,completed);assert.equal(gpu.pending.length,0);assert.equal(s.r.layerVisible,false);assert.equal(gpu.canvas.style.display,'none');assert.equal(g.gridVersion,revision);assert.deepEqual(s.r.im.data,ref.im.data);assert.equal(s.main.context.composition[0].source,s.r.buffer);assertNoGPUCopy(s);
 const clears=s.main.context.clears;s.r.draw(g,{ghost:false});assert.equal(s.main.context.clears,clears);
});

test('Context loss hides the layer and restoration repaints the same revision before revealing it again',()=>{
 const s=setup(),g=game(),gpu=makeVisible(s,g,{ghost:false}),revision=g.gridVersion,epoch=gpu.epoch;assert.equal(gpu.canvas.fire('webglcontextlost'),true);s.r.draw(g,{ghost:false});const ref=new GrainRenderer(canvas(),{surfaceBackend:'cpu'});ref.draw(g,{ghost:false});assert.equal(s.r.layerVisible,false);assert.equal(gpu.canvas.style.display,'none');assert.deepEqual(s.r.im.data,ref.im.data);assert.equal(gpu.epoch,epoch+1);
 gpu.canvas.fire('webglcontextrestored');s.r.draw(g,{ghost:false});assert.equal(gpu.ready,true);assert.equal(s.r.layerVisible,false);assert.equal(gpu.canvas.style.display,'none');gpu.gl.signaled=true;s.r.draw(g,{ghost:false});assert.equal(s.r.layerVisible,true);assert.equal(gpu.lastCompleted.epoch,gpu.epoch);assert.equal(g.gridVersion,revision);assert.equal(s.host.children.length,2);assertNoGPUCopy(s);
});

test('Upload, shade and fence failures hide direct GPU output and paint exact CPU reference pixels',()=>{
 for(const property of['injectUpload','injectShade','nullFence']){const s=setup(),g=game(),gpu=makeVisible(s,g,{ghost:false});gpu.gl.signaled=true;gpu.gl[property]=property==='nullFence'?true:gpu.gl.INVALID_OPERATION;g.grid[150]=3;g.material[150]=208;g.gridVersion++;s.r.draw(g,{ghost:false});const ref=new GrainRenderer(canvas(),{surfaceBackend:'cpu'});ref.draw(g,{ghost:false});assert.equal(gpu.ready,false,property);assert.equal(s.r.layerVisible,false,property);assert.equal(gpu.canvas.style.display,'none');assert.deepEqual(s.r.im.data,ref.im.data,property);assert.equal(s.main.context.composition[0].source,s.r.buffer);assertNoGPUCopy(s);}
});

test('Unavailable WebGL and an explicit CPU renderer remain exact and opaque in the transparent foreground',()=>{
 const s=setup({unavailable:true}),g=game();s.r.draw(g,{ghost:false});assert.equal(s.r.surfaceGPU.ready,false);assert.equal(s.r.layerVisible,false);assert.equal(s.r.surfaceGPU.canvas.style.display,'none');const ref=new GrainRenderer(canvas(),{surfaceBackend:'cpu',directDisplay:true});ref.draw(g,{ghost:false});assert.equal(ref.surfaceGPU,null);assert.equal(ref.ctx,ref.canvas.context);assert.equal(ref.canvas.contextOptions.alpha,true);assert.deepEqual(s.r.im.data,ref.im.data);for(let i=3;i<s.r.im.data.length;i+=4)assert.equal(s.r.im.data[i],255);assertNoGPUCopy(s);
});

test('Legacy offscreen copies retry same-revision preference or state changes after a deferred submission',()=>{
 for(const change of['contrast','state']){
  setup();const g=game(),main=canvas(),r=new GrainRenderer(main),initial={ghost:false,contrast:false};r.draw(g,initial);const gpu=r.surfaceGPU,revision=g.gridVersion,uploads=r.pctx.uploads;let options={ghost:false,contrast:change==='contrast'};if(change==='state')g.state='paused';
  r.draw(g,options);assert.equal(gpu.lastOutcome,'deferred');assert.equal(gpu.submissions,1);assert.equal(r.lastRevision,revision);assert.equal(r.pctx.uploads,uploads);assert.equal(r.boardSource,gpu.canvas);
  gpu.gl.signaled=true;r.draw(g,options);assert.equal(gpu.submissions,2,change+' must not be stranded by whole-frame reuse');assert.equal(gpu.lastOutcome,'submitted');assert.equal(r.lastPalette,options.contrast);assert.equal(r.lastState,g.state);assert.equal(gpu.paletteContrast,options.contrast);assert.equal(g.gridVersion,revision);assert(main.context.calls.some(c=>c.type==='image'&&c.source===gpu.canvas));
 }
});

test('Explicit renderer invalidation refreshes a same-revision direct CPU fallback fixture',()=>{
 const s=setup({unavailable:true}),g=game();s.r.draw(g,{ghost:false});const before=s.r.im.data.slice(),revision=g.gridVersion;g.grid[101]=3;g.material[101]=77;s.r.lastRevision=-1;s.r.presented=null;s.r.draw(g,{ghost:false});
 const ref=new GrainRenderer(canvas(),{surfaceBackend:'cpu'});ref.draw(g,{ghost:false});assert.equal(g.gridVersion,revision);assert.notDeepEqual(s.r.im.data,before);assert.deepEqual(s.r.im.data,ref.im.data);assert.equal(s.r.lastRevision,revision);assert.equal(s.main.context.composition[0].source,s.r.buffer);
});
