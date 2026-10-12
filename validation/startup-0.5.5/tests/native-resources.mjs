import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createCanvas:nativeCreateCanvas}=createRequire(import.meta.url)('@napi-rs/canvas');
const live=new Set();
export function createCanvas(w,h){assert(w<=288&&h<=512,'bounded DPR1 fixture only');const c=nativeCreateCanvas(w,h);live.add(c);return c;}
test.afterEach(async()=>{
 let bytes=0;
 for(const c of live){assert(c.width<=288&&c.height<=512,'all resized surfaces stay bounded');bytes+=c.width*c.height*4;c.width=1;c.height=1;}
 console.log(`NATIVE_RELEASE surfaces=${live.size} surface_bytes=${bytes}`);
 live.clear();
 await new Promise(setImmediate);global.gc?.();await new Promise(setImmediate);global.gc?.();
});
