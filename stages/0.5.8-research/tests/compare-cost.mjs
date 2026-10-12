import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../evidence/',import.meta.url);
const a=JSON.parse(fs.readFileSync(new URL('paired-baseline/result.json',root))),b=JSON.parse(fs.readFileSync(new URL('paired-candidate/result.json',root)));
for(const r of[a,b]){assert.equal(r.status,'passed');assert(r.sourceUnchanged);assert.equal(r.outputs.total,223);assert.equal(r.outputs.quiet,60);}
assert.deepEqual(a.outputs,b.outputs);assert.deepEqual(a.preparation.ledger,b.preparation.ledger);assert.deepEqual(a.preparation.integrity,b.preparation.integrity);assert.deepEqual(a.drop,b.drop);assert.deepEqual(a.settled,b.settled);assert.deepEqual(a.final,b.final);assert.deepEqual(a.acks,b.acks);assert.deepEqual(a.commands,b.commands);assert.deepEqual(a.worldMetricsDelta,b.worldMetricsDelta);
for(let i=0;i<a.trace.length;i++){const strip=({ms,counts,...row})=>row;assert.deepEqual(strip(a.trace[i]),strip(b.trace[i]),'RGBA/ACK/ops frame '+i);}
const keys=['active:game.step','active:world.frameStep','active:world.ruleStep','active:world.sync','active:renderer.drawSubmit','active:renderer.fullReadback','active:main.prepareInclusive'];
const timings=Object.fromEntries(keys.map(k=>[k,{baseline:a.timings[k],candidate:b.timings[k],totalChangePercent:100*(b.timings[k].totalMs/a.timings[k].totalMs-1)}]));
const summary={baselineBuild:a.buildId,candidateBuild:b.buildId,exactFrames:a.trace.length,acks:a.acks.length,physicsPathsAndLedgerEquivalent:true,RGBAAndPaintOperationsEquivalent:true,quietZeroRepaintFrames:60,timings,operations:{baseline:a.operations,candidate:b.operations},scope:'Single serial native pair, one fixed dense state and same actual inputs. Timings include probes, same-process clone only. Output canvas released each frame, persistent material caches. No browser FPS, persistent browser memory or IPC claim.'};
fs.writeFileSync(new URL('PAIRED-COST-SUMMARY.json',root),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({frames:summary.exactFrames,acks:summary.acks,timings},null,2));
