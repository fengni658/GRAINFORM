import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {harness} from '../dom-harness.mjs';
const source=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
test('Pause and game-over regions name their visible state and focus the next action',async()=>{
 const h=await harness({entry:'preview'});assert.equal(h.el('overlay').attrs['aria-labelledby'],'overlayTitle');assert.equal(h.el('gameCanvas').attrs.tabindex,'-1');
 h.api.start();assert.equal(h.document.activeElement,h.el('gameCanvas'));assert.equal(h.el('gameCanvas').attrs.tabindex,'0');h.key('KeyP');assert.equal(h.el('overlay').attrs['aria-labelledby'],'pauseTitle');assert.equal(h.el('pausePanel').hidden,false);assert.equal(h.document.activeElement,h.el('resumeButton'));assert.equal(h.el('gameCanvas').attrs.tabindex,'-1');h.el('resumeButton').dispatch('click');assert.equal(h.api.game.state,'playing');assert.equal(h.document.activeElement,h.el('gameCanvas'));
 h.api.game.active=null;h.api.game.spawnDelay=0;h.api.game.grid.fill(1,0,288*96);h.frame();assert.equal(h.el('overlay').attrs['aria-labelledby'],'overTitle');assert.equal(h.document.activeElement,h.el('againButton'));h.el('againButton').dispatch('click');assert.equal(h.api.game.state,'playing');assert.equal(h.document.activeElement,h.el('gameCanvas'));
});
test('Settings/help close retains pause and returns focus; background pause does not steal focus',async()=>{
 const h=await harness({entry:'preview'});h.el('howButton').dispatch('click');h.el('helpDialog').close();assert.equal(h.document.activeElement,h.el('howButton'));assert.equal(h.api.game.state,'ready');h.api.start();
 for(const [button,dialog] of [['settingsButton','settingsDialog'],['helpButton','helpDialog']]){h.el(button).focus();h.el(button).dispatch('click');assert.equal(h.api.game.state,'paused');h.el(dialog).close();assert.equal(h.api.game.state,'paused');assert.equal(h.document.activeElement,h.el(button));h.api.resume();}
 h.el('settingsButton').focus();h.window.dispatch('blur');assert.equal(h.api.game.state,'paused');assert.equal(h.document.activeElement,h.el('settingsButton'));
});
test('293 raw grains show consistently in clear feedback, cumulative HUD and result',async()=>{
 const h=await harness({entry:'preview'});h.api.start();const g=h.api.game;g.active=null;g.grid.fill(0);g.added=293;g.removed=0;
 for(let x=0;x<288;x++)g.grid[431*288+x]=1;for(let x=0;x<5;x++)g.grid[430*288+x]=1;
 g.beginClear();g.finishClear();assert.equal(g.rawCleared,293);assert.equal(g.cleared,32);assert.equal(g.score,133);h.frame();assert.match(h.el('announcer').textContent,/消除293粒/);assert.equal(h.el('toast').children[1].textContent,'+133 · 293 粒');assert(h.document.querySelectorAll('[data-cleared]').every(e=>e.textContent==='293'));
 g.active=null;g.spawnDelay=0;g.clearTimer=0;g.grid.fill(1,0,288*96);h.frame();assert.match(h.el('endDetails').innerHTML,/293<\/strong>粒沙/);assert.match(h.el('announcer').textContent,/消除293粒/);
});
test('Small footer text uses a readable token against the page background in both modes',()=>{
 const css=source('dist/preview/style.css');assert.match(css,/\.footer\{[^}]*color:var\(--muted\)/);
 const lum=hex=>{const v=hex.match(/\w\w/g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722;};
 const bg=css.match(/--bg:#([0-9a-f]{6})/)[1],normal=css.match(/--muted:#([0-9a-f]{6})/)[1],high=css.match(/\.high-contrast\{[^}]*--muted:#([0-9a-f]{6})/)[1];for(const color of [normal,high])assert((lum(color)+.05)/(lum(bg)+.05)>=4.5);
});
test('Visible guidance explains goal, diagonals, gaps, controls, actual units and refresh boundary',()=>{
 const html=source('dist/preview/game.html');assert.match(html,/同色沙粒连通左右两墙即消除/);assert.match(html,/斜角也算，空隙不算/);assert.match(html,/刷新后将开始新局/);assert.match(html,/只保存设置和最高分，刷新或关闭页面不保留本局/);assert.match(html,/界面显示实际沙粒数/);assert.match(html,/本次沙粒数 ÷ 9/);assert.match(html,/最后四舍五入/);assert.match(html,/16,200 粒/);assert.match(html,/<h2 id="pauseTitle">游戏已暂停/);assert.match(html,/<h2 id="overTitle">本局结束/);
});

test('Closing a dialog after its opener becomes CSS-hidden uses the current-state fallback',async()=>{
 for(const state of ['ready','paused','over']){
  const h=await harness({entry:'preview'});if(state!=='ready'){h.api.start();if(state==='paused')h.api.pause();else{h.api.game.active=null;h.api.game.spawnDelay=0;h.api.game.grid.fill(1,0,288*96);h.frame();}}
  h.el('footerHelp').dispatch('click');h.el('footerHelp').layoutHidden=true;h.el('helpDialog').close();assert.equal(h.document.activeElement,h.el({ready:'startButton',paused:'resumeButton',over:'againButton'}[state]));assert.equal(h.api.game.state,state);
 }
});

test('Save hint has its own opaque backing so its contrast does not depend on the dunes',()=>{
 const css=source('dist/preview/style.css'),rules=[...css.matchAll(/\.save-hint\s*\{([^}]+)\}/g)];assert.equal(rules.length,1);
 const declarations=Object.fromEntries(rules[0][1].split(';').filter(Boolean).map(d=>d.split(':').map(s=>s.trim())));
 assert.match(declarations.background,/^#[0-9a-f]{6}$/i,'The hint backing must be an opaque color, not the transparent overlay or page color alone');
 assert.equal(declarations.color,'var(--muted)');assert.equal(declarations.padding,'3px 6px');assert.equal(declarations['flex-shrink'],'0');
 const rgb=hex=>hex.replace('#','').match(/\w\w/g).map(v=>parseInt(v,16));
 const luminance=channels=>{const v=channels.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722;};
 const normal=css.match(/--muted:#([0-9a-f]{6})/)[1],high=css.match(/\.high-contrast\{[^}]*--muted:#([0-9a-f]{6})/)[1],backing=rgb(declarations.background);
 // This is a CSS contract/color-math check. Real viewport composition remains browser QA.
 for(const underneath of [[0,0,0],[255,255,255],[238,196,104],[88,212,202]]){
  const composited=backing.map((channel,i)=>channel*1+underneath[i]*0);
  for(const text of [normal,high])assert((luminance(rgb(text))+.05)/(luminance(composited)+.05)>=4.5);
 }
});
