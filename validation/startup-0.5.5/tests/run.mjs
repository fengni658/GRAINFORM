import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
function manifest(dir){return fs.readdirSync(new URL(dir,root)).sort().map(file=>({file,sha256:hash(fs.readFileSync(new URL(dir+file,root)))}));}
fs.mkdirSync(new URL('evidence/',root),{recursive:true});
const before={candidate:manifest('candidate/'),baseline:manifest('baseline/')};
assert.equal(before.candidate.length,18);assert.equal(before.baseline.length,18);
assert.deepEqual(before.candidate.filter(f=>f.file!=='app.mjs'),before.baseline.filter(f=>f.file!=='app.mjs'),'only app changed');
const runs=[];
for(const [file,expected]of[['visibility-startup.test.mjs',7],['preview-recovery.test.mjs',2],['preview-independent.test.mjs',2],['app-stages-independent.test.mjs',6],['sixcolor.test.mjs',3]]){
 const args=['--expose-gc','--test','--test-reporter=tap','--test-concurrency=1',fileURLToPath(new URL(file,import.meta.url))];
 const r=spawnSync(process.execPath,args,{encoding:'utf8',timeout:90000,maxBuffer:8*1024*1024});
 const log=(r.stdout||'')+(r.stderr||'');fs.writeFileSync(new URL('evidence/'+file+'.tap',root),log);
 const count=k=>Number(log.match(new RegExp('^# '+k+' (\\d+)$','m'))?.[1]??0);
 const result={file,tests:count('tests'),pass:count('pass'),fail:count('fail'),skipped:count('skipped'),status:r.status,signal:r.signal,error:r.error?.message};
 result.ok=result.tests===expected&&result.pass===expected&&result.fail===0&&result.skipped===0&&r.status===0;runs.push(result);console.log(JSON.stringify(result));
}
assert.deepEqual({candidate:manifest('candidate/'),baseline:manifest('baseline/')},before,'production sources unchanged');
const report={scope:'Actual app and simulation runtime, native Canvas, DOM and event-loop doubles. Not real-browser evidence or proof of user screenshot cause.',node:process.version,canvas:createRequire(import.meta.url)('@napi-rs/canvas/package.json').version,sourceUnchanged:true,manifests:before,runs,ok:runs.every(r=>r.ok)};
fs.writeFileSync(new URL('evidence/test-results.json',root),JSON.stringify(report,null,2)+'\n');if(!report.ok)process.exitCode=1;
