import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const root=new URL('../',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('RUNTIME-MANIFEST.json',root)));
test('release manifest binds every source/build byte and HTML entry',()=>{
 assert.equal(manifest.version,'0.4.10');assert.equal(manifest.runtimeFiles.length,20);
 for(const f of manifest.runtimeFiles){const b=fs.readFileSync(new URL(f.path,root));assert.equal(b.length,f.bytes,f.path);assert.equal(createHash('sha256').update(b).digest('hex'),f.sha256,f.path);}
 const html=fs.readFileSync(new URL('index.html',root),'utf8');assert.equal(html,fs.readFileSync(new URL('play-b6104e010aee4.html',root),'utf8'));
 for(const name of ['app.mjs','style.css'])assert.ok(html.includes(`./builds/${manifest.build}/${name}`));
 for(const f of manifest.runtimeFiles.filter(f=>f.path.startsWith('builds/'))){const name=f.path.split('/').at(-1);assert.deepEqual(fs.readFileSync(new URL(f.path,root)),fs.readFileSync(new URL(name,root)),name);}
 assert.match(html,/0\.4\.10 测试版/);assert.doesNotMatch(html,/0\.4\.11/);
});
test('HTTP serves all manifest files with correct bytes and rejects private files',async()=>{
 const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:'4198',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
 try {await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Server exited')}),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('Server startup timeout')),5000);t.unref();})]);
 for(const f of manifest.runtimeFiles){const res=await fetch(`http://127.0.0.1:4198/${f.path}`);assert.equal(res.status,200,f.path);assert.equal(res.headers.get('cache-control'),'no-store');assert.deepEqual(Buffer.from(await res.arrayBuffer()),fs.readFileSync(new URL(f.path,root)));}
 assert.equal((await fetch('http://127.0.0.1:4198/')).status,200);
 for(const p of ['README.md','package.json','tests/queue-continuity.test.mjs','dist/index.html'])assert.equal((await fetch(`http://127.0.0.1:4198/${p}`)).status,404,p);
 }finally {child.kill();await once(child,'exit');}
});
