import { runRankCase, runRankSuite, conciseResult } from './qa.mjs';
import { probeCases, DEFAULT_CASES } from './cases.mjs';
const $=id=>document.getElementById(id),gl=$('compute').getContext('webgl2',{antialias:false,alpha:false,preserveDrawingBuffer:false});
const ext=gl?.getExtension('WEBGL_debug_renderer_info');
const capability={webgl2:!!gl,floatColorBuffer:!!gl?.getExtension('EXT_color_buffer_float'),renderer:gl?(ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)):null,userAgent:navigator.userAgent,hardwarePerformanceClaim:false};
let running=false,last=null;const results=[];
for(const s of probeCases()){const option=document.createElement('option');option.value=s.name;option.textContent=s.name;$('case').append(option);}
function show(value){$('status').textContent=JSON.stringify(value,null,2);}
async function exclusive(action){if(running)throw Error('A functional check is already running');if(!gl)throw Error('WebGL2 unavailable; no simulated fallback');running=true;for(const id of['run','small','all'])$(id).disabled=true;try{return await action();}catch(e){last={passed:false,error:String(e),realGPUResultAvailable:false};show(last);throw e;}finally{running=false;for(const id of['run','small','all'])$(id).disabled=false;}}
const api={capability,caseNames:probeCases().map(x=>x.name),results,get last(){return last;},get lastSummary(){return last?.cases?{passed:last.passed,caseCount:last.caseCount,cases:last.cases.map(conciseResult)}:last?.result?conciseResult(last):last;},get running(){return running;},
 async runCase(name='boundary-crossing'){return exclusive(async()=>{show({running:name,scope:'Functional GPU bucket check, not a benchmark'});last=await runRankCase(gl,name);results.push(last);show(conciseResult(last));return last;});},
 async runSmallSuite(){return exclusive(async()=>{show({running:DEFAULT_CASES,stress:false});last=await runRankSuite(gl);results.push(...last.cases);show({...last,cases:last.cases.map(conciseResult)});return last;});},
 async runAllFunctionalCases(){return exclusive(async()=>{show({running:'All bounded functionality and rejection cases',stress:false});last=await runRankSuite(gl,{names:probeCases().map(x=>x.name)});results.push(...last.cases);show({...last,cases:last.cases.map(conciseResult)});return last;});},
};
window.__GRID_RANK_QA=api;
$('run').onclick=()=>api.runCase($('case').value).catch(()=>{});$('small').onclick=()=>api.runSmallSuite().catch(()=>{});$('all').onclick=()=>api.runAllFunctionalCases().catch(()=>{});
show({ready:true,executedCases:0,capability,scope:'Independent GPU bucket-function probe. CPU eligibility/readback/oracle are intentional. No physics, benchmark, or deployment claim.'});document.documentElement.dataset.probeReady='true';
