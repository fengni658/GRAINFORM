// Cross-platform runner: no shell glob expansion is required on Windows.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const dir of ['evidence','validation/evidence'])fs.mkdirSync(path.join(root,dir),{recursive:true});
const files=process.argv.includes('--independent')
 ? ['core-review','input-edges','credit-regression'].map(n=>path.join(root,'validation','independent-review',n+'.test.mjs'))
 : ['validation/model-contracts','validation'].flatMap(dir=>fs.readdirSync(path.join(root,dir)).filter(n=>n.endsWith('.test.mjs')).sort().map(n=>path.join(root,dir,n)));
const result=spawnSync(process.execPath,['--expose-gc','--test','--test-concurrency=1',...files],{cwd:root,stdio:'inherit'});if(result.error)throw result.error;process.exitCode=result.status??1;
