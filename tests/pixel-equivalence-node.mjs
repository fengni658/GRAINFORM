import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),{createCanvas}=require('@napi-rs/canvas');
const {runPixelEquivalence}=await import('./pixel-equivalence.mjs');
const report=await runPixelEquivalence({backend:'existing @napi-rs/canvas (Node raster correctness only, not browser timing)',createCanvas:()=>createCanvas(288,432)});
await writeFile(new URL('../evidence/pixel-equivalence-node.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,drawComparisons:report.drawComparisons,failures:report.failures.length,candidateStatus:report.candidateStatus}));
assert.equal(report.passed,true,'Candidate pixels must match the frozen renderer exactly');
