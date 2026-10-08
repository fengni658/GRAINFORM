/** Independent GPU bucket-function probe. It intentionally reads back for CPU
 * eligibility and QA; it is NOT the no-readback physics step or a speed result. */
import { CONTRACT as C, cellOf, directSortGrid, validateOldGrid } from './contract/rank-grid.mjs';
import { canonicalizeRecords, qualifyWholeRound, freshDiagnostics } from './eligibility.mjs';
import { decodeGPUPositions } from './position-encoding.mjs';
export const SHADER_FILES=Object.freeze(['fullscreen.vert.glsl','peel.vert.glsl','id.frag.glsl','rank.frag.glsl','scatter.vert.glsl']);
export async function loadSources(){return Object.fromEntries(await Promise.all(SHADER_FILES.map(async name=>{const r=await fetch(new URL(`./shaders/${name}`,import.meta.url));if(!r.ok)throw Error(`Shader ${name}: HTTP ${r.status}`);return[name,await r.text()];})));}
export async function createRankPrototype(gl,oldRecords,options={}){return new RankPrototype(gl,oldRecords,{...options,sources:options.sources??await loadSources()});}
const clone=records=>records.map(p=>({...p}));
const bucketIndex=(x,y,k)=>((y*C.cols+x)*C.layers+k);
function compile(gl,v,f,label){const p=gl.createProgram(),shaders=[];try{for(const[type,source]of[[gl.VERTEX_SHADER,v],[gl.FRAGMENT_SHADER,f]]){if(typeof source!=='string')throw Error(`Missing ${label} shader source`);const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(`${label}: ${gl.getShaderInfoLog(s)}`);gl.attachShader(p,s);}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(`${label}: ${gl.getProgramInfoLog(p)}`);return{program:p,locations:new Map(),label};}catch(e){gl.deleteProgram(p);throw e;}finally{for(const s of shaders)gl.deleteShader(s);}}
function mismatchSummary(actual,expected,limit=8){let count=0;const examples=[];for(let i=0;i<actual.length;i++)if(actual[i]!==expected[i]){count++;if(examples.length<limit)examples.push({index:i,actual:actual[i],expected:expected[i]});}return{count,examples};}
export function compareGridToOracle(actual,oracle){
  const buckets=mismatchSummary(actual.buckets,oracle.buckets),counts=mismatchSummary(actual.counts,oracle.counts);
  const sort=xs=>[...xs].sort((a,b)=>a.slot-b.slot),a=sort(actual.ranks),b=sort(oracle.ranks);
  let rankMismatches=0;const rankExamples=[];
  for(let i=0;i<Math.max(a.length,b.length);i++)if(JSON.stringify(a[i])!==JSON.stringify(b[i])){rankMismatches++;if(rankExamples.length<8)rankExamples.push({actual:a[i],expected:b[i]});}
  const diagnostics=Object.keys(oracle.diagnostics).every(k=>actual.diagnostics[k]===oracle.diagnostics[k]);
  const beyond=JSON.stringify([...actual.beyondWitnessSlots].sort((a,b)=>a-b))===JSON.stringify([...oracle.beyondWitnessSlots].sort((a,b)=>a-b));
  return{passed:buckets.count===0&&counts.count===0&&rankMismatches===0&&diagnostics&&beyond,bucketMismatches:buckets,countsMismatches:counts,rankMismatches,rankExamples,diagnosticsMatch:diagnostics,beyondWitnessMatch:beyond,checkedBucketSlots:C.cols*C.rows*C.layers};
}
export class RankPrototype{
  constructor(gl,oldRecords,{sources,inheritedDiagnostics,allowFaultInjection=false}={}){
    if(!gl||typeof gl.texStorage2D!=='function')throw Error('WebGL2 is required');
    if(!gl.getExtension('EXT_color_buffer_float'))throw Error('EXT_color_buffer_float is required; no simulated GPU fallback');
    this.gl=gl;this._textures=[];this._fbos=[];this._programs=[];this.disposed=false;this.generation=0;this.stopped=false;this.allowFaultInjection=allowFaultInjection;
    this.draws={peel:0,rank:0,scatter:0};this.readbacks=0;this.feedbackChecks=0;this.sticky=freshDiagnostics(inheritedDiagnostics);
    const canonical=canonicalizeRecords(oldRecords);this.records=canonical.records;this.slotCapacity=this.records.reduce((n,p)=>Math.max(n,p.slot+1),1);
    const max=gl.getParameter(gl.MAX_TEXTURE_SIZE);this.width=Math.min(max,2**Math.ceil(Math.log2(Math.ceil(Math.sqrt(this.slotCapacity)))));this.height=Math.ceil(this.slotCapacity/this.width);
    if(max<990||this.height>max)throw Error('Insufficient texture dimensions');
    if(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)<3||gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS)<2)throw Error('Insufficient texture sampler support');
    try{
      const program=(v,f,label)=>{const p=compile(gl,sources[v],sources[f],label);this._programs.push(p);return p;};
      this.programs={peel:program('peel.vert.glsl','id.frag.glsl','initial depth peel'),rank:program('fullscreen.vert.glsl','rank.frag.glsl','whole-generation rank'),scatter:program('scatter.vert.glsl','id.frag.glsl','rank scatter')};
      this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
      this.anchorTextures=[this._texture(this.width,this.height),this._texture(this.width,this.height)];
      this.rankTexture=this._texture(this.width,this.height);
      this.atlasPairs=[[this._texture(58,990),this._texture(58,990)],[this._texture(58,990),this._texture(58,990)]];
      this.oldAnchors=this.anchorTextures[0];this.nextAnchors=this.anchorTextures[1];this.oldAtlas=this.atlasPairs[0];this.newAtlas=this.atlasPairs[1];
      if(new Set([...this.oldAtlas,...this.newAtlas,this.rankTexture]).size!==5)throw Error('Old/new/rank storage aliases');
      this.passFbo=this._fbo();this.readFbo=this._fbo();
      this.depth=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,this.depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,58,990);
      this.peelFbos=this.oldAtlas.map(t=>{const f=this._fbo();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,this.depth);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);this._complete();return f;});
      this.oldEncoded=this._uploadAnchors(this.oldAnchors,canonical);this.initialEncodingError=canonical.maxEncodingError;
      this._buildInitial();
      const old=this._readOldGrid();this.sticky={...old.diagnostics};
      const expected=directSortGrid(this.records,this.sticky),diff=mismatchSummary(old.buckets,expected.buckets);
      const validity=validateOldGrid(old);
      this.initial={mode:'gpu-depth-peel',generation:0,bucketComparison:{passed:diff.count===0,...diff,checkedBucketSlots:C.cols*C.rows*C.layers},diagnostics:{...old.diagnostics},validity,particleSlots:this.records.length,draws:{...this.draws},gpuReadback:true,maxEncodingError:this.initialEncodingError};
      if(diff.count||!validity.ok){this.stopped=true;this.sticky.invalid=true;this.stopReason=diff.count?'initial-gpu-oracle-mismatch':validity.reason;}
    }catch(e){this.dispose();throw e;}
  }
  _assert(){if(this.disposed)throw Error('Disposed rank prototype');if(this.gl.isContextLost())throw Error('WebGL context lost');}
  _state(){const g=this.gl;g.bindVertexArray(this.vao);for(const cap of[g.BLEND,g.CULL_FACE,g.DITHER,g.SCISSOR_TEST,g.DEPTH_TEST,g.RASTERIZER_DISCARD])g.disable(cap);g.colorMask(true,true,true,true);}
  _texture(w,h){const g=this.gl,t=g.createTexture();this._textures.push(t);g.bindTexture(g.TEXTURE_2D,t);for(const[name,value]of[[g.TEXTURE_MIN_FILTER,g.NEAREST],[g.TEXTURE_MAG_FILTER,g.NEAREST],[g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE],[g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE]])g.texParameteri(g.TEXTURE_2D,name,value);g.texStorage2D(g.TEXTURE_2D,1,g.RGBA32F,w,h);g.texSubImage2D(g.TEXTURE_2D,0,0,0,w,h,g.RGBA,g.FLOAT,new Float32Array(w*h*4));return t;}
  _fbo(){const f=this.gl.createFramebuffer();this._fbos.push(f);return f;}
  _complete(){const g=this.gl;if(g.checkFramebufferStatus(g.FRAMEBUFFER)!==g.FRAMEBUFFER_COMPLETE)throw Error('RGBA32F framebuffer incomplete');}
  _target(texture,w,h){const g=this.gl;this._state();g.bindFramebuffer(g.FRAMEBUFFER,this.passFbo);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,texture,0);g.drawBuffers([g.COLOR_ATTACHMENT0]);g.viewport(0,0,w,h);this._complete();this.outputTexture=texture;}
  _use(p,samplers,values={}){const g=this.gl;g.useProgram(p.program);const loc=name=>{if(!p.locations.has(name))p.locations.set(name,g.getUniformLocation(p.program,name));return p.locations.get(name);};for(let i=0;i<samplers.length;i++){const[name,texture]=samplers[i];if(texture===this.outputTexture)throw Error(`Framebuffer feedback forbidden in ${p.label}`);g.activeTexture(g.TEXTURE0+i);g.bindTexture(g.TEXTURE_2D,texture);g.uniform1i(loc(name),i);}this.feedbackChecks++;for(const[name,value]of Object.entries(values)){if(Array.isArray(value))g.uniform2i(loc(name),...value);else g.uniform1i(loc(name),value);}}
  _uploadAnchors(texture,canonical){const data=new Float32Array(this.width*this.height*4);for(const[slot,p]of canonical.encodedBySlot){if(slot>=this.slotCapacity)throw Error('Whole-round new-slot rejection must precede upload');data.set(p,slot*4);}const g=this.gl;g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,texture);g.texSubImage2D(g.TEXTURE_2D,0,0,0,this.width,this.height,g.RGBA,g.FLOAT,data);return data;}
  _buildInitial(){const g=this.gl;this._state();g.enable(g.DEPTH_TEST);g.enable(g.SCISSOR_TEST);g.depthMask(true);g.depthFunc(g.LESS);g.clearColor(0,0,0,0);g.clearDepth(1);
    for(let layer=0;layer<17;layer++){const parity=layer%2,y=Math.floor(layer/2)*110;g.bindFramebuffer(g.FRAMEBUFFER,this.peelFbos[parity]);this.outputTexture=this.oldAtlas[parity];g.drawBuffers([g.COLOR_ATTACHMENT0]);g.viewport(0,y,58,110);g.scissor(0,y,58,110);g.clear(g.COLOR_BUFFER_BIT|g.DEPTH_BUFFER_BIT);this._use(this.programs.peel,[['uAnchors',this.oldAnchors],['uPreviousLayer',this.oldAtlas[1-parity]]],{uStateSize:[this.width,this.height],uSlotCapacity:this.slotCapacity,uLayer:layer});g.drawArrays(g.POINTS,0,this.slotCapacity);this.draws.peel++;}
    this._state();
  }
  _read(texture,w,h){const g=this.gl,data=new Float32Array(w*h*4);g.bindFramebuffer(g.FRAMEBUFFER,this.readFbo);g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,texture,0);g.readBuffer(g.COLOR_ATTACHMENT0);this._complete();g.readPixels(0,0,w,h,g.RGBA,g.FLOAT,data);this.readbacks++;const error=g.getError();if(error!==g.NO_ERROR)throw Error(`GPU readback error 0x${error.toString(16)}`);return data;}
  _atlasBuckets(atlas){const data=atlas.map(t=>this._read(t,58,990)),buckets=new Uint32Array(C.cols*C.rows*C.layers);let malformed=false,overflow=false;
    for(let y=0;y<110;y++)for(let x=0;x<58;x++)for(let k=0;k<17;k++){const at=((Math.floor(k/2)*110+y)*58+x)*4,v=data[k%2][at];if(!Number.isInteger(v)||v<0||v>C.maxSlot+1){malformed=true;continue;}buckets[bucketIndex(x,y,k)]=v;if(k===16&&v>0)overflow=true;}
    return{buckets,malformed,overflow};
  }
  _readOldGrid(){const encoded=this._read(this.oldAnchors,this.width,this.height);let mutated=false;for(let i=0;i<encoded.length;i++)if(encoded[i]!==this.oldEncoded[i]){mutated=true;break;}const decoded=decodeGPUPositions(encoded),anchors=this.records.map(p=>({...p,x:decoded[p.slot*4],y:decoded[p.slot*4+1],alive:decoded[p.slot*4+2]>0.5}));const a=this._atlasBuckets(this.oldAtlas),diagnostics={...this.sticky};diagnostics.overflow ||=a.overflow;diagnostics.nonfinite ||=a.malformed||anchors.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y));diagnostics.outOfGrid ||=anchors.some(p=>{const c=cellOf(p);return p.alive&&(c.x<0||c.x>=58||c.y<0||c.y>=110);});diagnostics.invalid ||=diagnostics.overflow||diagnostics.nonfinite||diagnostics.outOfGrid||diagnostics.driftExceeded||mutated;return{anchors,buckets:a.buckets,diagnostics,anchorMutationDetected:mutated};}
  _stop(reason,detail={}){this.stopped=true;this.stopReason=reason;this.sticky.invalid=true;if(detail.outOfGrid)this.sticky.outOfGrid=true;if(detail.nonfinite)this.sticky.nonfinite=true;const result={mode:'stopped',reason,...detail,adopted:false,generation:this.generation,diagnostics:{...this.sticky},draws:{...this.draws},gpuRankSubmitted:false,scope:'Independent readback-gated bucket probe; no physics step'};this.last=result;return result;}
  advance(nextInput){this._assert();if(this.stopped)return this._stop(this.stopReason??'previously-stopped');const drawsBefore={...this.draws};let canonical;try{canonical=canonicalizeRecords(nextInput);}catch(e){return this._stop(e.code??'invalid-input',{message:e.message,nonfinite:e.code==='nonfinite-position'});}
    const guardStart=performance.now();const old=this._readOldGrid();this.sticky={...old.diagnostics};const qualification=qualifyWholeRound(old,canonical.records);const mandatoryGuardCompletedMs=performance.now()-guardStart;if(!qualification.eligible)return this._stop(qualification.reason,qualification);
    const encoded=this._uploadAnchors(this.nextAnchors,canonical),g=this.gl;
    this._target(this.rankTexture,this.width,this.height);this._use(this.programs.rank,[['uNextAnchors',this.nextAnchors],['uOldEven',this.oldAtlas[0]],['uOldOdd',this.oldAtlas[1]]],{uStateSize:[this.width,this.height],uSlotCapacity:this.slotCapacity});g.drawArrays(g.TRIANGLES,0,3);this.draws.rank++;
    const rankData=this._read(this.rankTexture,this.width,this.height),ranks=[],counts=new Uint32Array(58*110),rankAddresses=new Set();let rankError=null;
    for(const p of canonical.records){const at=p.slot*4,v=rankData.slice(at,at+4);if(!p.alive){if(v[3]!==0)rankError='dead-slot-has-rank';continue;}const target=cellOf(p);if(![...v].every(Number.isFinite)||!Number.isInteger(v[0])||v[0]<0||v[0]>=144||v[1]!==target.x||v[2]!==target.y||v[3]!==1){rankError='gpu-rank-contract-failure';continue;}const address=`${v[1]},${v[2]},${v[0]}`;if(rankAddresses.has(address)){rankError='duplicate-gpu-rank-address';continue;}rankAddresses.add(address);ranks.push({slot:p.slot,cellX:v[1],cellY:v[2],rank:v[0]});counts[v[2]*58+v[1]]++;}
    if(rankError){const r=this._stop(rankError,{proof:qualification.proof});r.gpuRankSubmitted=true;r.rankReadback=Array.from(rankData);return r;}
    for(let parity=0;parity<2;parity++){this._target(this.newAtlas[parity],58,990);g.clearColor(0,0,0,0);g.clear(g.COLOR_BUFFER_BIT);this._use(this.programs.scatter,[['uRanks',this.rankTexture]],{uStateSize:[this.width,this.height],uParity:parity});g.drawArrays(g.POINTS,0,this.slotCapacity);this.draws.scatter++;}
    const a=this._atlasBuckets(this.newAtlas),diagnostics={...this.sticky};diagnostics.overflow ||=a.overflow||counts.some(n=>n>16);diagnostics.nonfinite ||=a.malformed;diagnostics.invalid ||=diagnostics.overflow||diagnostics.nonfinite;
    const grid={anchors:clone(canonical.records),buckets:a.buckets,counts,ranks,beyondWitnessSlots:ranks.filter(p=>p.rank>=17).map(p=>p.slot),diagnostics};
    const finalOracleStart=performance.now();const oracle=directSortGrid(canonical.records,this.sticky),comparison=compareGridToOracle(grid,oracle);const finalOracleMs=performance.now()-finalOracleStart;
    const adopted=comparison.passed&&!diagnostics.invalid;
    if(adopted){[this.oldAtlas,this.newAtlas]=[this.newAtlas,this.oldAtlas];[this.oldAnchors,this.nextAnchors]=[this.nextAnchors,this.oldAnchors];this.records=clone(canonical.records);this.oldEncoded=encoded;this.generation++;}else{this.stopped=true;this.stopReason=comparison.passed?'new-grid-overflow-or-invalid':'gpu-oracle-mismatch';diagnostics.invalid=true;}
    this.sticky={...diagnostics};const result={benchmarkTiming:{mandatoryGuardCompletedMs,finalOracleMs},mode:'gpu-rank',generation:this.generation,attemptedGeneration:adopted?this.generation:this.generation+1,adopted,proof:qualification.proof,grid,comparison,diagnostics:{...diagnostics},particleSlots:canonical.records.length,liveSlots:ranks.length,rankTuplesRetained:ranks.length,beyondWitnessSlots:grid.beyondWitnessSlots.length,drawDelta:Object.fromEntries(Object.keys(this.draws).map(k=>[k,this.draws[k]-drawsBefore[k]])),draws:{...this.draws},readbacks:this.readbacks,feedbackChecks:this.feedbackChecks,gpuReadback:true,maxEncodingError:canonical.maxEncodingError,scope:'Actual GPU rank and scatter with CPU whole-round eligibility/readback/oracle; no physics or performance claim'};this.last=result;return result;
  }
  injectOldBucketForQA({cellX,cellY,layer,encodedSlot}){this._assert();if(!this.allowFaultInjection)throw Error('Fault injection is not enabled');if(![cellX,cellY,layer,encodedSlot].every(Number.isInteger)||cellX<0||cellX>=58||cellY<0||cellY>=110||layer<0||layer>=17||encodedSlot<0||encodedSlot>C.maxSlot+1)throw Error('Invalid QA corruption address');const g=this.gl;g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,this.oldAtlas[layer%2]);g.texSubImage2D(g.TEXTURE_2D,0,cellX,Math.floor(layer/2)*110+cellY,1,1,g.RGBA,g.FLOAT,new Float32Array([encodedSlot,0,0,encodedSlot?1:0]));}
  dispose(){if(this.disposed)return;const g=this.gl;for(const p of this._programs??[])g.deleteProgram(p.program);for(const t of this._textures??[])g.deleteTexture(t);for(const f of this._fbos??[])g.deleteFramebuffer(f);if(this.depth)g.deleteRenderbuffer(this.depth);if(this.vao)g.deleteVertexArray(this.vao);this.disposed=true;}
}
