// This models WebGL calls and state only. Real shader compilation and GPU pixel
// readback are separate mandatory browser checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {SurfaceGPU} from '../../dist/preview/surface-gpu.js';
import {GrainRenderer} from '../../dist/preview/renderer.js';
import {Game} from '../../dist/preview/engine.js';

class FakeGL {
 constructor(){let e=1;for(const key of 'VERSION RENDERER HIGH_FLOAT RENDERBUFFER_DEPTH_SIZE VERTEX_SHADER FRAGMENT_SHADER COMPILE_STATUS LINK_STATUS RGBA32F RGBA FLOAT RGBA8UI RGBA_INTEGER UNSIGNED_BYTE R32UI RED_INTEGER UNSIGNED_INT TEXTURE_2D TEXTURE_MIN_FILTER TEXTURE_MAG_FILTER TEXTURE_WRAP_S TEXTURE_WRAP_T NEAREST CLAMP_TO_EDGE ARRAY_BUFFER RENDERBUFFER DEPTH_COMPONENT32F FRAMEBUFFER COLOR_ATTACHMENT0 DEPTH_ATTACHMENT FRAMEBUFFER_COMPLETE DYNAMIC_DRAW BLEND DITHER CULL_FACE SCISSOR_TEST DEPTH_TEST LESS COLOR DEPTH TRIANGLES SYNC_GPU_COMMANDS_COMPLETE ALREADY_SIGNALED CONDITION_SATISFIED WAIT_FAILED TIMEOUT_EXPIRED QUERY_RESULT_AVAILABLE QUERY_RESULT'.split(' '))this[key]=e++;this.TEXTURE0=1000;this.NO_ERROR=0;this.INVALID_OPERATION=1282;this.OUT_OF_MEMORY=1285;this.unit=0;this.textures=new Map();this.trace=[];this.livePrograms=new Set();this.serial=0;this.error=0;this.lost=false;this.signaled=false;this.feedback=0;this.doubleEnd=0;this.ext={TIME_ELAPSED_EXT:3000,GPU_DISJOINT_EXT:3001};}
 object(kind){return {kind,id:++this.serial};}
 createShader(kind){return {...this.object('Shader'),shaderKind:kind};} shaderSource(s,text){s.source=text;} compileShader(){} getShaderParameter(s){return !(this.failShadeCompile&&s.source.includes('vec3 matte('));} getShaderInfoLog(){return 'mock shade compilation rejected';} deleteShader(){}
 createProgram(){const p={...this.object('Program'),shaders:[],values:new Map()};this.livePrograms.add(p);return p;} attachShader(p,s){p.shaders.push(s);} linkProgram(p){p.source=p.shaders.map(s=>s.source).join('\n');} getProgramParameter(){return true;} deleteProgram(p){this.livePrograms.delete(p);} getProgramInfoLog(){return '';}
 getUniformLocation(p,name){return new RegExp('uniform[^;]*\\b'+name+'\\s*;').test(p.source)?{p,name}:null;} uniform1i(u,v){if(u)u.p.values.set(u.name,v);} uniform2i(u,...v){if(u)u.p.values.set(u.name,v);} useProgram(p){this.program=p;}
 getParameter(key){if(key===this.VERSION)return 'WebGL 2.0 mock';if(key===this.RENDERER)return 'Mock only, no shader execution';if(key===this.ext.GPU_DISJOINT_EXT)return !!this.disjoint;return 0;} getExtension(){return this.noTimer?null:this.ext;} getShaderPrecisionFormat(){return {precision:this.precision??23,rangeMin:127,rangeMax:127};} getRenderbufferParameter(){return this.depthBits??32;} getError(){const e=this.error;this.error=0;return e;} isContextLost(){return this.lost;}
 createTexture(){return this.object('Texture');} deleteTexture(){} activeTexture(unit){this.unit=unit-this.TEXTURE0;} bindTexture(_,t){this.textures.set(this.unit,t);} texParameteri(){} texImage2D(){} texSubImage2D(){if(this.injectUpload)this.error=this.injectUpload;}
 createVertexArray(){return this.object('VertexArray');} deleteVertexArray(){} bindVertexArray(){} createBuffer(){return this.object('Buffer');} deleteBuffer(){} bindBuffer(){} enableVertexAttribArray(){} vertexAttribIPointer(){} vertexAttribDivisor(){} bufferData(_,data){this.instances=data.slice();}
 createRenderbuffer(){return this.object('Renderbuffer');} deleteRenderbuffer(){} bindRenderbuffer(){} renderbufferStorage(){}
 createFramebuffer(){return this.object('Framebuffer');} deleteFramebuffer(){} bindFramebuffer(_,fbo){this.fbo=fbo;} framebufferTexture2D(_a,_b,_c,t){this.fbo.color=t;} framebufferRenderbuffer(_a,_b,_c,r){this.fbo.depth=r;} checkFramebufferStatus(){return this.FRAMEBUFFER_COMPLETE;}
 viewport(){} disable(){} enable(){} depthMask(){} depthFunc(value){this.depth=value;} clearBufferuiv(_a,_b,data){(this.clears??=[]).push({kind:'owner',framebuffer:this.fbo,value:[...data]});} clearBufferfv(_a,_b,data){(this.clears??=[]).push({kind:'depth',framebuffer:this.fbo,value:[...data]});}
 checkFeedback(){if(this.fbo){for(const match of this.program.source.matchAll(/uniform\s+(?:highp\s+)?(?:u?sampler2D)\s+(\w+)\s*;/g)){const unit=this.program.values.get(match[1]);if(this.textures.get(unit)===this.fbo.color){this.feedback++;this.error=this.INVALID_OPERATION;}}}}
 drawArraysInstanced(_a,_b,_c,count){this.checkFeedback();this.trace.push({pass:this.program.values.get('uSecond'),depth:this.depth,count,framebuffer:this.fbo});if(this.injectSites)this.error=this.injectSites;}
 drawArrays(){this.checkFeedback();this.trace.push({pass:'shade'});if(this.injectShade)this.error=this.injectShade;}
 createQuery(){return this.object('Query');} beginQuery(){this.queryActive=true;} endQuery(){if(!this.queryActive)this.doubleEnd++;this.queryActive=false;} deleteQuery(){} getQueryParameter(_q,key){return key===this.QUERY_RESULT_AVAILABLE?this.signaled:2e6;}
 fenceSync(){if(this.injectFence)this.error=this.injectFence;return this.nullFence?null:this.object('Sync');} deleteSync(){} clientWaitSync(){return this.signaled?this.CONDITION_SATISFIED:this.TIMEOUT_EXPIRED;} flush(){}
}
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
 const g=makeGame(),r=new GrainRenderer(canvas()),reference=new GrainRenderer(canvas(),{surfaceBackend:'cpu'});r.draw(g,{ghost:false});assert.equal(r.boardSource,r.surfaceGPU.canvas);r.surfaceGPU.gl.injectShade=r.surfaceGPU.gl.INVALID_OPERATION;g.gridVersion++;r.draw(g,{ghost:false});reference.draw(g,{ghost:false});assert.equal(r.boardSource,r.buffer);assert.deepEqual(r.im.data,reference.im.data);assert.equal(r.presented.backendEpoch,r.surfaceGPU.epoch);const draws=r.canvas.context.calls.length;r.draw(g,{ghost:false});assert.equal(r.canvas.context.calls.length,draws);
});

test('Context loss falls back immediately and restoration repaints even at the same game revision',()=>{
 const g=makeGame(),r=new GrainRenderer(canvas()),reference=new GrainRenderer(canvas(),{surfaceBackend:'cpu'});r.draw(g,{ghost:false});const gpu=r.surfaceGPU,epoch=gpu.epoch;assert.equal(gpu.snapshot().pending,1);gpu.canvas.fire('webglcontextlost');r.draw(g,{ghost:false});reference.draw(g,{ghost:false});assert.equal(gpu.epoch,epoch+1);assert.equal(gpu.snapshot().cancelledMeasurements,1);assert.equal(r.boardSource,r.buffer);assert.deepEqual(r.im.data,reference.im.data);gpu.canvas.fire('webglcontextrestored');r.draw(g,{ghost:false});assert.equal(gpu.ready,true);assert.equal(r.boardSource,gpu.canvas);assert.equal(r.presented.backendEpoch,gpu.epoch);
});

test('Missing or failed fences are accounted for and cannot silently drop completion evidence',()=>{
 const g=makeGame();for(const config of[{nullFence:true},{injectFence:1285}]){const gpu=configuredGPU(config);assert.equal(gpu.draw(g.grid,g.material,g.width,g.height,{revision:11}),null);const s=gpu.snapshot();assert.equal(s.backend,'cpu-fallback');assert.equal(s.submissions,1);assert.equal(s.completed,0);assert.equal(s.pending,0);assert.equal(s.cancelledMeasurements,1);assert.match(s.reason,/completion fence failed/);assert.equal(gpu.gl.doubleEnd,0);}
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

test('Pending timing measurements are bounded and overflow is disclosed',()=>{
 const g=makeGame(),gpu=new SurfaceGPU();for(let i=0;i<65;i++)assert(gpu.draw(g.grid,g.material,g.width,g.height,{revision:i}));const s=gpu.snapshot();assert.equal(s.submissions,65);assert.equal(s.pending,64);assert.equal(s.skippedMeasurements,1);gpu.gl.signaled=true;gpu.poll();assert.equal(gpu.snapshot().completed,64);assert.equal(gpu.snapshot().pending,0);assert.equal(gpu.snapshot().lastCompletedRevision,63);
});
