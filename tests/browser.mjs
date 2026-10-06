import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_URL || 'playwright');
const outputDir = process.env.QA_OUTPUT_DIR || 'qa-output';
const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:4173/';
const testUrl = new URL('/?qa', baseUrl).href;
fs.mkdirSync(outputDir, { recursive: true });
const browser = await chromium.launch({
 headless: true,
 ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {})
});
try {
const reports=[];
for(const [name,width,height] of [['desktop',1440,900],['mobile',390,844],['small',320,568],['landscape',844,390]]){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:name!=='desktop',hasTouch:name!=='desktop'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(testUrl);await page.waitForTimeout(200);await page.screenshot({path:path.join(outputDir,`${name}-start.png`),fullPage:true});
 const layout=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,width:innerWidth,height:innerHeight,bodyHeight:document.body.scrollHeight,canvas:(()=>{let r=document.querySelector('#gameCanvas').getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom};})()}));assert(layout.scrollWidth<=width+1,`${name} horizontal overflow`);
 await page.getByRole('button',{name:'开始游戏'}).click();if(name!=='desktop'){assert(await page.locator('#touchControls').isVisible(),`${name} touch controls hidden`);await page.locator('[data-action=left]').click();await page.locator('[data-action=rotate]').click();}await page.waitForTimeout(1000);assert.equal(await page.evaluate(()=>__grainform.game.state),'playing');
 await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowUp');await page.keyboard.press('Space');await page.waitForTimeout(500);await page.screenshot({path:path.join(outputDir,`${name}-play.png`),fullPage:true});
 await page.getByRole('button',{name:'暂停游戏',exact:true}).click();assert.equal(await page.evaluate(()=>__grainform.game.state),'paused');const t=await page.evaluate(()=>__grainform.game.tick);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>__grainform.game.tick),t);
 await page.getByRole('button',{name:'继续游戏',exact:true}).last().click();await page.getByRole('button',{name:'游戏设置'}).click();assert.equal(await page.evaluate(()=>__grainform.game.state),'paused');await page.locator('#contrastToggle').check();await page.locator('#motionToggle').check();await page.locator('#soundToggle').uncheck();await page.locator('#settingsDialog [data-close]').last().click();assert.equal(await page.evaluate(()=>__grainform.game.state),'paused');await page.locator('#resumeButton').click();
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await page.evaluate(()=>__grainform.game.state),'paused');await page.locator('#restartButton').click();assert.equal(await page.evaluate(()=>__grainform.game.pieces),0);
 reports.push({name,layout,errors,metrics:await page.evaluate(()=>__grainform.metrics())});assert.equal(errors.length,0);await context.close();
}
// Denied storage must not block play.
const context=await browser.newContext();const page=await context.newPage();await page.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Denied','SecurityError');}});});await page.goto(testUrl);await page.locator('#startButton').click();assert.equal(await page.evaluate(()=>__grainform.game.state),'playing');assert.equal(await page.evaluate(()=>__grainform.readState().storageAvailable),false);await context.close();
fs.writeFileSync(path.join(outputDir,'browser-results.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
} finally {
 await browser.close();
}
