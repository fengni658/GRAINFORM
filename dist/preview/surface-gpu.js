import {SURFACE_MATERIALS} from './surface-grains.js';
import {grainPalette} from './grain-raster.js';
import {SITE_VERTEX,SITE_FRAGMENT,QUAD_VERTEX,SHADE_FRAGMENT} from './surface-gpu-shaders.js';

let tables;
export function gpuTables(){
 if(tables)return tables;
 const distance=new Float32Array(81*256*4).fill(16),face=new Float32Array(distance.length),material=new Uint8Array(256*2*4);
 for(let m=0;m<256;m++){
  const d=SURFACE_MATERIALS[m];material[m*4]=+d.anchor;material[m*4+1]=d.tone;if(!d.anchor)continue;
  let minX=4,minY=4,maxX=-4,maxY=-4;
  for(const f of d.footprint){minX=Math.min(minX,f.x);minY=Math.min(minY,f.y);maxX=Math.max(maxX,f.x);maxY=Math.max(maxY,f.y);
   const at=(m*81+(f.y+4)*9+f.x+4)*4;
   for(let q=0;q<4;q++){distance[at+q]=Number.isFinite(f.samples[q])?f.samples[q]:16;const dx=f.x+((q&1)?.75:.25)-(.5+d.jx),dy=f.y+(q>=2?.75:.25)-(.5+d.jy);face[at+q]=Math.max(-7,Math.min(5,-(dx+dy)*.7071*3.2));}
  }
  material[m*4+2]=minX+4;material[m*4+3]=minY+4;material[(256+m)*4]=maxX+5;material[(256+m)*4+1]=maxY+5;
 }
 return tables={distance,face,material};
}
class Stats{
 constructor(){this.count=0;this.sum=0;this.max=0;this.hist=new Uint32Array(2001);}
 add(ms){this.count++;this.sum+=ms;this.max=Math.max(this.max,ms);this.hist[Math.min(2000,Math.floor(ms*20))]++;}
 read(){let n=0,p95=0;for(let i=0;i<this.hist.length;i++){n+=this.hist[i];if(this.count&&n>=Math.ceil(this.count*.95)){p95=i===2000?this.max:(i+1)/20;break;}}return{count:this.count,meanMs:this.count?this.sum/this.count:0,p95Ms:p95,maxMs:this.max};}
}
function program(gl,vs,fs){
 const shaders=[];let p;
 try{for(const [kind,source]of[[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){const s=gl.createShader(kind);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)||'Shader compilation failed');}
  p=gl.createProgram();for(const s of shaders)gl.attachShader(p,s);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p)||'Program linking failed');return p;
 }catch(error){if(p)gl.deleteProgram(p);throw error;}finally{for(const s of shaders)gl.deleteShader(s);}
}
export class SurfaceGPU{
 constructor({clock=()=>performance.now()}={}){
  this.clock=clock;this.canvas=document.createElement('canvas');this.epoch=0;this.ready=false;this.reason='not-initialized';this.pending=[];this.initialization=new Stats();this.gpuTime=new Stats();this.completedWall=new Stats();this.submission=new Stats();this.playingSubmission=new Stats();this.playingGpu=new Stats();this.playingCompletedWall=new Stats();this.submissions=0;this.deferredRequests=0;this.coalescedRequests=0;this.maxInFlight=0;this.lastOutcome='idle';this.lastRequested=null;this.lastSubmitted=null;this.lastCompleted=null;this.completed=0;this.skippedMeasurements=0;this.cancelledMeasurements=0;this.disjointQueries=0;this.lastCompletedRevision=null;
  this.canvas.addEventListener?.('webglcontextlost',event=>{event.preventDefault();this.ready=false;this.reason='context-lost';this.epoch++;this.cancelledMeasurements+=this.pending.length;this.pending=[];});
  this.canvas.addEventListener?.('webglcontextrestored',()=>{this.epoch++;this.initialize();});
  this.initialize();
 }
 initialize(){
  const begin=this.clock();try{
   const gl=this.canvas.getContext('webgl2',{alpha:false,antialias:false,depth:true,stencil:false,preserveDrawingBuffer:true});
   if(!gl||typeof gl.getParameter!=='function'||!String(gl.getParameter(gl.VERSION)).includes('WebGL 2')){this.reason='webgl2-unavailable';return;}
   this.gl=gl;const precision=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT);if(!precision||precision.precision<23)throw Error('32-bit fragment precision unavailable');this.resources=[];this.targets=[];this.width=0;this.height=0;this.paletteContrast=null;
   this.site=program(gl,SITE_VERTEX,SITE_FRAGMENT);this.resources.push(['Program',this.site]);this.shade=program(gl,QUAD_VERTEX,SHADE_FRAGMENT);this.resources.push(['Program',this.shade]);
   this.uniforms=new Map();for(const p of[this.site,this.shade]){const locations={};for(const name of['uSize','uGrid','uDistance','uWinner','uRunner','uMaterial','uPalette','uFace','uSecond','uContrast','uClear'])locations[name]=gl.getUniformLocation(p,name);this.uniforms.set(p,locations);}
   const t=gpuTables();this.distance=this.texture(gl.RGBA32F,81,256,gl.RGBA,gl.FLOAT,t.distance);this.face=this.texture(gl.RGBA32F,81,256,gl.RGBA,gl.FLOAT,t.face);this.material=this.texture(gl.RGBA8UI,256,2,gl.RGBA_INTEGER,gl.UNSIGNED_BYTE,t.material);this.palette=this.texture(gl.RGBA8UI,1024,8,gl.RGBA_INTEGER,gl.UNSIGNED_BYTE,new Uint8Array(grainPalette(false).buffer));this.dummy=this.texture(gl.R32UI,1,1,gl.RED_INTEGER,gl.UNSIGNED_INT,new Uint32Array(1));
   this.vao=gl.createVertexArray();this.buffer=gl.createBuffer();this.resources.push(['VertexArray',this.vao],['Buffer',this.buffer]);gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.enableVertexAttribArray(0);gl.vertexAttribIPointer(0,4,gl.UNSIGNED_INT,16,0);gl.vertexAttribDivisor(0,1);gl.bindVertexArray(null);
   this.queryExt=gl.getExtension('EXT_disjoint_timer_query_webgl2');this.renderer=String(gl.getParameter(gl.RENDERER));const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('WebGL initialization error '+error);this.reason=null;this.ready=true;
  }catch(error){this.fail(error);}finally{this.initialization.add(Math.max(0,this.clock()-begin));}
 }
 texture(internal,w,h,format,type,data,target=false){const gl=this.gl,t=gl.createTexture();(target?this.targets:this.resources).push(['Texture',t]);gl.bindTexture(gl.TEXTURE_2D,t);for(const [key,value]of[[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,key,value);gl.texImage2D(gl.TEXTURE_2D,0,internal,w,h,0,format,type,data);return t;}
 release(list){if(!this.gl)return;for(const[k,v]of list||[])this.gl['delete'+k]?.(v);if(list)list.length=0;}
 fail(error){this.lastOutcome='failed';this.ready=false;this.reason=String(error?.message||error).slice(0,240);this.epoch++;this.release(this.targets);this.release(this.resources);this.cancelledMeasurements+=this.pending.length;for(const p of this.pending){if(p.fence)this.gl?.deleteSync(p.fence);if(p.query)this.gl?.deleteQuery(p.query);}this.pending=[];}
 size(w,h){
  if(w===this.width&&h===this.height)return;const gl=this.gl;this.release(this.targets);this.width=w;this.height=h;this.canvas.width=w*2;this.canvas.height=h*2;
  this.gridData=new Uint8Array(w*h*4);this.anchorData=new Uint32Array(w*h*4);this.grid=this.texture(gl.RGBA8UI,w,h,gl.RGBA_INTEGER,gl.UNSIGNED_BYTE,null,true);this.owners=[];this.fbos=[];
  this.depth=gl.createRenderbuffer();this.targets.push(['Renderbuffer',this.depth]);gl.bindRenderbuffer(gl.RENDERBUFFER,this.depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT32F,w*2,h*2);if(gl.getRenderbufferParameter(gl.RENDERBUFFER,gl.RENDERBUFFER_DEPTH_SIZE)!==32)throw Error('32-bit float depth unavailable');
  for(let n=0;n<2;n++){const tex=this.texture(gl.R32UI,w*2,h*2,gl.RED_INTEGER,gl.UNSIGNED_INT,null,true),fbo=gl.createFramebuffer();this.targets.push(['Framebuffer',fbo]);this.owners.push(tex);this.fbos.push(fbo);gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,this.depth);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Integer owner/depth framebuffer unsupported');}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 }
 bind(p,name,unit,texture){const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(this.uniforms.get(p)[name],unit);}
 poll(){
  if(!this.ready)return;const gl=this.gl;if(gl.isContextLost()){this.fail(Error('WebGL context lost'));return;}const now=this.clock(),disjoint=this.queryExt&&gl.getParameter(this.queryExt.GPU_DISJOINT_EXT);
  for(let i=this.pending.length-1;i>=0;i--){const p=this.pending[i];if(p.query&&disjoint){gl.deleteQuery(p.query);p.query=null;this.disjointQueries++;}
   if(p.fence){const status=gl.clientWaitSync(p.fence,0,0);if(status===gl.ALREADY_SIGNALED||status===gl.CONDITION_SATISFIED){gl.deleteSync(p.fence);p.fence=null;this.completed++;this.completedWall.add(Math.max(0,now-p.at));if(p.playing)this.playingCompletedWall.add(Math.max(0,now-p.at));if(p.id>(this.lastCompletedId||0)){this.lastCompletedId=p.id;this.lastCompletedRevision=p.revision;this.lastCompleted={id:p.id,revision:p.revision,generation:p.generation,tick:p.tick,epoch:p.epoch,submittedAtMs:p.at,observedAtMs:now};}}else if(status===gl.WAIT_FAILED){this.fail(Error('GPU completion wait failed (WAIT_FAILED)'));return;}}
   if(p.query&&gl.getQueryParameter(p.query,gl.QUERY_RESULT_AVAILABLE)){const ms=gl.getQueryParameter(p.query,gl.QUERY_RESULT)/1e6;this.gpuTime.add(ms);if(p.playing)this.playingGpu.add(ms);gl.deleteQuery(p.query);p.query=null;}
   if(!p.fence&&!p.query)this.pending.splice(i,1);
  }
 }
 draw(g,m,w,h,{contrast=false,clearMask=null,revision=null,playing=false,generation=0,tick=0}={}){
  if(!this.ready){this.lastOutcome='failed';return null;}this.poll();if(!this.ready)return null;const gl=this.gl,start=this.clock();
  if(!this.lastRequested||this.lastRequested.revision!==revision||this.lastRequested.generation!==generation||this.lastRequested.contrast!==contrast||this.lastRequested.clearing!==!!clearMask){if(this.lastOutcome==='deferred')this.coalescedRequests++;this.lastRequested={revision,generation,tick,contrast,clearing:!!clearMask,requestedAtMs:start};}
  if(this.pending.some(p=>p.fence)){this.lastOutcome='deferred';this.deferredRequests++;return null;}
  let query=null,queryActive=false;
  try{
   this.size(w,h);let count=0;for(let i=0;i<g.length;i++){const c=g[i],at=i*4;this.gridData[at]=c;this.gridData[at+1]=m[i];this.gridData[at+2]=clearMask?.[i]||0;if(c&&SURFACE_MATERIALS[m[i]].anchor){const k=count++*4;this.anchorData[k]=i%w;this.anchorData[k+1]=(i/w)|0;this.anchorData[k+2]=m[i];this.anchorData[k+3]=c;}}
   gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.grid);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,w,h,gl.RGBA_INTEGER,gl.UNSIGNED_BYTE,this.gridData);
   if(this.paletteContrast!==contrast){gl.bindTexture(gl.TEXTURE_2D,this.palette);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,1024,8,gl.RGBA_INTEGER,gl.UNSIGNED_BYTE,new Uint8Array(grainPalette(contrast).buffer));this.paletteContrast=contrast;}
   gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,this.anchorData.subarray(0,count*4),gl.DYNAMIC_DRAW);
   const measured=this.pending.filter(p=>p.query).length<64;if(measured&&this.queryExt){query=gl.createQuery();gl.beginQuery(this.queryExt.TIME_ELAPSED_EXT,query);queryActive=true;}
   gl.viewport(0,0,w*2,h*2);gl.disable(gl.BLEND);gl.disable(gl.DITHER);gl.disable(gl.CULL_FACE);gl.disable(gl.SCISSOR_TEST);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LESS);gl.useProgram(this.site);gl.bindVertexArray(this.vao);gl.uniform2i(this.uniforms.get(this.site).uSize,w,h);this.bind(this.site,'uGrid',0,this.grid);this.bind(this.site,'uDistance',1,this.distance);this.bind(this.site,'uMaterial',2,this.material);
   for(let pass=0;pass<2;pass++){gl.bindFramebuffer(gl.FRAMEBUFFER,this.fbos[pass]);this.bind(this.site,'uWinner',3,pass?this.owners[0]:this.dummy);gl.uniform1i(this.uniforms.get(this.site).uSecond,pass);gl.clearBufferuiv(gl.COLOR,0,new Uint32Array(4));gl.clearBufferfv(gl.DEPTH,0,new Float32Array([1]));gl.drawArraysInstanced(gl.TRIANGLES,0,6,count);}
   gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.disable(gl.DEPTH_TEST);gl.bindVertexArray(null);gl.useProgram(this.shade);const u=this.uniforms.get(this.shade);gl.uniform2i(u.uSize,w,h);gl.uniform1i(u.uContrast,+contrast);gl.uniform1i(u.uClear,+!!clearMask);
   for(const [name,tex,unit]of[['uGrid',this.grid,0],['uWinner',this.owners[0],1],['uRunner',this.owners[1],2],['uMaterial',this.material,3],['uPalette',this.palette,4],['uDistance',this.distance,5],['uFace',this.face,6]])this.bind(this.shade,name,unit,tex);
   gl.drawArrays(gl.TRIANGLES,0,3);if(query){gl.endQuery(this.queryExt.TIME_ELAPSED_EXT);queryActive=false;}const error=gl.getError();if(error!==gl.NO_ERROR||gl.isContextLost())throw Error('WebGL surface draw failed '+error);this.submissions++;
   const fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0),fenceError=gl.getError();if(!fence||fenceError!==gl.NO_ERROR){if(fence)gl.deleteSync(fence);this.cancelledMeasurements++;throw Error('GPU completion fence failed '+fenceError);}this.pending.push({id:this.submissions,query,fence,at:start,revision,playing,generation,tick,epoch:this.epoch});if(!measured)this.skippedMeasurements++;this.maxInFlight=Math.max(this.maxInFlight,this.pending.filter(p=>p.fence).length);this.lastSubmitted={id:this.submissions,revision,generation,tick,epoch:this.epoch,submittedAtMs:start};this.lastOutcome='submitted';gl.flush();const elapsed=this.clock()-start;this.submission.add(elapsed);if(playing)this.playingSubmission.add(elapsed);return this.canvas;
  }catch(error){if(query){try{if(queryActive)gl.endQuery(this.queryExt.TIME_ELAPSED_EXT);gl.deleteQuery(query);}catch{}}this.fail(error);return null;}
 }
 snapshot(){const now=this.clock(),fences=this.pending.filter(p=>p.fence);return{lastOutcome:this.lastOutcome,inFlightSubmissions:fences.length,maxInFlightSubmissions:this.maxInFlight,deferredRequests:this.deferredRequests,coalescedVisualRequests:this.coalescedRequests,oldestInFlightWallMs:fences.length?Math.max(0,now-Math.min(...fences.map(p=>p.at))):0,lastRequested:this.lastRequested,lastSubmitted:this.lastSubmitted,lastCompleted:this.lastCompleted,completionTickLag:this.lastCompleted&&this.lastRequested&&this.lastCompleted.generation===this.lastRequested.generation?Math.max(0,this.lastRequested.tick-this.lastCompleted.tick):null,backend:this.ready?'webgl2':'cpu-fallback',reason:this.reason,fallbackLimit:this.ready?null:'Same larger surface; dense CPU rebuilds exceeded the local frame budget. No fallback smoothness guarantee.',epoch:this.epoch,renderer:this.renderer||null,submissions:this.submissions,completed:this.completed,pending:this.pending.length,skippedMeasurements:this.skippedMeasurements,cancelledMeasurements:this.cancelledMeasurements,disjointQueries:this.disjointQueries,lastCompletedRevision:this.lastCompletedRevision,initializationWall:this.initialization.read(),cpuSubmission:this.submission.read(),gpuElapsed:this.gpuTime.read(),completionObservedWall:this.completedWall.read(),playing:{cpuSubmission:this.playingSubmission.read(),gpuElapsed:this.playingGpu.read(),completionObservedWall:this.playingCompletedWall.read()},scope:'Initialization has its own wall metric. The existing initial ready draw and context-restored handler can run outside RAF; initialization inside RAF and polling are included in its full callback. pixelBuild is CPU build or GPU submission work, not GPU completion; GPU elapsed excludes CPU upload preparation. Fence completion is a polling upper bound for this surface only, excluding the outer 2D canvas composite and display scanout. Offscreen drawing buffer is retained for unchanged-board reuse. At most one surface submission is in flight; deferred visual states are coalesced, without dropping simulation time. Optional elapsed queries are capped at64; every accepted submission retains a completion fence. Completion tick lag is not physical paint latency. Hardware versus software execution is not inferred from API availability.'};}
}
