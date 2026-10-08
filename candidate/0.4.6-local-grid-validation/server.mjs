import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const home=dirname(fileURLToPath(import.meta.url));
export async function createPublicServer(){
 const root=await realpath(home),manifest=JSON.parse(await readFile(resolve(root,'PUBLIC-MANIFEST.json'),'utf8'));
 const allow=new Set([...manifest.files.map(f=>f.path),'PUBLIC-MANIFEST.json']);
 const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.glsl':'text/plain; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
 return http.createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
  try{
   const raw=decodeURIComponent(new URL(req.url,'http://localhost').pathname),relative=raw==='/'?'index.html':raw.replace(/^\//,'');
   if(!allow.has(relative))throw Error('Not publicly allowlisted');
   const path=await realpath(resolve(root,relative));if(!path.startsWith(root+sep)||!(await stat(path)).isFile())throw Error('Outside root');
   res.writeHead(200,{'Content-Type':mime[extname(path)]??'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Opener-Policy':'same-origin'});
   if(req.method==='HEAD')res.end();else{const stream=createReadStream(path);stream.on('error',()=>res.destroy());stream.pipe(res);}
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');}
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const server=await createPublicServer(),host=process.env.HOST??'127.0.0.1',port=Number(process.env.PORT??4180);server.listen(port,host,()=>console.log(`Private local sand-rule demo: http://${host}:${server.address().port}/`));}
