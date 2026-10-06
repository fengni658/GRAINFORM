import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './dom-harness.mjs';
const clear=h=>{h.el('settingsButton').dispatch('click');h.el('resetBest').dispatch('click');h.el('confirmReset').dispatch('click');h.frame();};
for(const entry of ['base','preview']){
 const key=entry==='base'?'grainform.best':'grainform.preview.v1.best';
 test(`${entry}: successful reset changes memory, durable value and reloaded value together`,async()=>{
  const h=await harness({entry,initial:{[key]:'5000'}});clear(h);
  assert.equal(h.api.readState().best,0);assert.equal(h.storage.get(key),'0');assert.equal(h.el('resetStatus').textContent,'本地最高分已清除');assert.equal(h.el('resetStatus').hidden,false);assert.equal(h.document.activeElement,h.el('resetBest'));
  const reload=await harness({entry,initial:Object.fromEntries(h.storage)});assert.equal(reload.api.readState().best,0);
 });
 for(const writeErrorName of ['SecurityError','QuotaExceededError'])test(`${entry}: ${writeErrorName} keeps old best and visibly reports reset failure`,async()=>{
  const h=await harness({entry,initial:{[key]:'5000'},denyWrite:true,writeErrorName});clear(h);
  assert.equal(h.api.readState().best,5000);assert.equal(h.storage.get(key),'5000');assert.match(h.el('resetStatus').textContent,/未能清除已保存记录/);assert.equal(h.el('resetStatus').hidden,false);assert.equal(h.el('announcer').textContent,h.el('resetStatus').textContent);assert(!h.el('announcer').textContent.includes('已清除'));assert.equal(h.api.readState().storageAvailable,false);
  const reload=await harness({entry,initial:Object.fromEntries(h.storage)});assert.equal(reload.api.readState().best,5000);
 });
 test(`${entry}: read and write denial preserves the last known in-memory best`,async()=>{
  const h=await harness({entry,initial:{[key]:'5000'}});h.setStorageAccess({read:true,write:true});clear(h);assert.equal(h.api.readState().best,5000);assert.equal(h.storage.get(key),'5000');assert.match(h.el('resetStatus').textContent,/未能清除/);h.el('settingsDialog').close();h.api.start();assert.equal(h.api.game.state,'playing');
 });
 test(`${entry}: unreadable existing storage never produces a false reset success`,async()=>{
  const h=await harness({entry,initial:{[key]:'5000'},denyRead:true,denyWrite:true});clear(h);assert.equal(h.api.readState().best,0);assert.equal(h.storage.get(key),'5000');assert.match(h.el('resetStatus').textContent,/未能清除/);const reload=await harness({entry,initial:Object.fromEntries(h.storage)});assert.equal(reload.api.readState().best,5000);
 });
 test(`${entry}: recovery retries work and replace stale failure feedback`,async()=>{
  const h=await harness({entry,initial:{[key]:'5000'},denyWrite:true});clear(h);h.setStorageAccess({write:false});h.el('resetBest').dispatch('click');assert.equal(h.el('resetStatus').hidden,true);h.el('confirmReset').dispatch('click');h.frame();assert.equal(h.storage.get(key),'0');assert.equal(h.api.readState().best,0);assert.equal(h.api.readState().storageAvailable,true);assert.equal(h.el('resetStatus').textContent,'本地最高分已清除');assert(!h.el('storageNotice').textContent.includes('不可用'));
 });
 test(`${entry}: cancellation performs no reset and restores a visible focus target`,async()=>{
  const h=await harness({entry,initial:{[key]:'5000'}});h.el('settingsButton').dispatch('click');h.el('resetBest').dispatch('click');assert.equal(h.document.activeElement,h.el('cancelReset'));h.el('cancelReset').dispatch('click');h.frame();assert.equal(h.storage.get(key),'5000');assert.equal(h.api.readState().best,5000);assert.equal(h.document.activeElement,h.el('resetBest'));assert.equal(h.el('resetStatus').hidden,true);
 });
 test(`${entry}: denied reset reads the latest other-tab record without overwriting it`,async()=>{
  const h=await harness({entry,initial:{[key]:'5000'}});h.storage.set(key,'9000');h.setStorageAccess({write:true});clear(h);assert.equal(h.api.readState().best,9000);assert.equal(h.storage.get(key),'9000');assert.match(h.el('resetStatus').textContent,/未能清除/);
 });
 test(`${entry}: a saved reset remains zero through queued events and unchanged session score`,async()=>{
  const h=await harness({entry,initial:{[key]:'5000'}});h.api.start();h.api.game.score=100;h.api.render();clear(h);h.window.dispatch('storage',{key,newValue:'5000'});h.frame();assert.equal(h.api.readState().best,0);assert.equal(h.storage.get(key),'0');h.el('settingsDialog').close();h.api.resume();h.api.game.score=200;h.api.render();assert.equal(h.storage.get(key),'200');
 });
 test(`${entry}: failed reset keeps a higher unsaved session best`,async()=>{
  const h=await harness({entry,initial:{[key]:'5000'},denyWrite:true});h.api.start();h.api.game.score=8000;h.api.render();assert.equal(h.api.readState().best,8000);clear(h);assert.equal(h.api.readState().best,8000);assert.equal(h.storage.get(key),'5000');assert.match(h.el('resetStatus').textContent,/未能清除/);
 });
 test(`${entry}: successful record reset does not hide an unsaved preference`,async()=>{
  const preferences=entry==='base'?'grainform.preferences':'grainform.preview.v1.preferences';
  const h=await harness({entry,initial:{[key]:'5000'},denyWrite:true});h.el('soundToggle').checked=false;h.el('soundToggle').dispatch('change');h.setStorageAccess({write:false});clear(h);assert.equal(h.storage.get(key),'0');assert.equal(h.storage.get(preferences),undefined);assert.equal(h.el('resetStatus').textContent,'本地最高分已清除');assert.match(h.el('storageNotice').textContent,/部分更改未保存/);h.el('soundToggle').dispatch('change');assert.equal(JSON.parse(h.storage.get(preferences)).sound,false);assert(!h.el('storageNotice').textContent.includes('未保存'));
 });
}
