import { createRankPrototype, loadSources } from './rank-prototype.mjs';
import { probeCases, DEFAULT_CASES } from './cases.mjs';
const assert=(condition,message)=>{if(!condition)throw Error(message);};
export async function runRankCase(gl,name,{sources}={}){
 const scenario=probeCases().find(x=>x.name===name);if(!scenario)throw Error(`Unknown case: ${name}`);
 const world=await createRankPrototype(gl,scenario.old,{sources:sources??await loadSources(),inheritedDiagnostics:scenario.inheritedDiagnostics,allowFaultInjection:!!scenario.corrupt});
 try{
  const initial=world.initial;if(scenario.corrupt)world.injectOldBucketForQA(scenario.corrupt);
  const before={...world.draws};const first=world.advance(scenario.next);let result=first;
  if(scenario.second){assert(first.mode==='gpu-rank'&&first.adopted&&first.comparison.passed,'First generation was not accepted');result=world.advance(scenario.second);}
  assert(result.mode===scenario.expectedMode,`${name}: mode ${result.mode} != ${scenario.expectedMode}`);
  if(result.mode==='stopped'){
   assert(result.reason===scenario.expectedReason,`${name}: ${result.reason} != ${scenario.expectedReason}`);
   assert(world.draws.rank===before.rank&&world.draws.scatter===before.scatter,'Stopped round must submit no rank/scatter draws');
   assert(world.generation===0,'Stopped qualification must not adopt output');
   const stoppedAgain=world.advance(scenario.old);assert(stoppedAgain.mode==='stopped'&&stoppedAgain.diagnostics.invalid,'A stopped generation cannot clear invalidity');
  }else{
   assert(result.comparison.passed,`${name}: CPU oracle mismatch ${JSON.stringify(result.comparison)}`);
   assert(result.diagnostics.overflow===scenario.expectedOverflow,`${name}: overflow mismatch`);
   assert(result.generation===scenario.expectedGeneration,`${name}: generation mismatch`);
   assert(result.rankTuplesRetained===(scenario.second??scenario.next).filter(p=>p.alive!==false).length,'A living slot/rank was dropped');
   assert(result.drawDelta.rank===1&&result.drawDelta.scatter===2&&result.drawDelta.peel===0,'No mixed rank/peel generation is permitted');
   if(scenario.expectedOverflow){assert(!result.adopted&&result.diagnostics.invalid,'Overflow result must not be adopted');const again=world.advance(scenario.old);assert(again.mode==='stopped'&&again.diagnostics.overflow,'Overflow must stay sticky');}
  }
  return {name,passed:true,initial:{...initial,validity:{ok:initial.validity.ok,reason:initial.validity.reason}},result,first:scenario.second?first:undefined,realShaderExecution:true,scope:'GPU bucket function only; CPU eligibility/readback/oracle; no physics or performance claim'};
 }finally{world.dispose();}
}
export async function runRankSuite(gl,{names=DEFAULT_CASES}={}){const sources=await loadSources(),results=[];for(const name of names)results.push(await runRankCase(gl,name,{sources}));return{passed:results.every(x=>x.passed),cases:results,caseCount:results.length,realShaderExecution:true,benchmark:false};}
export function conciseResult(report){const r=report.result;if(!r)return report;return{name:report.name,passed:report.passed,mode:r.mode,reason:r.reason,generation:r.generation,adopted:r.adopted,retainedParticleSlots:r.particleSlots,retainedRanks:r.rankTuplesRetained,beyondWitnessSlots:r.beyondWitnessSlots,comparison:r.comparison,diagnostics:r.diagnostics,proof:r.proof,drawDelta:r.drawDelta,draws:r.draws,readbacks:r.readbacks,realShaderExecution:true,scope:report.scope};}
