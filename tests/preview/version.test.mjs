import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
const text=path=>fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8');
test('0.4.0 package, visible fine-game version, QA builds and current docs agree',()=>{
 assert.equal(JSON.parse(text('package.json')).version,'0.4.0');
 assert.match(text('dist/preview/app.js'),/BUILD='grainform-fine-0\.4\.0'/);assert.match(text('dist/preview/ab.js'),/build:"grainform-fine-0\.4\.0"/);
 assert.match(text('dist/preview/game.html'),/<title>[^<]*0\.4\.0/);assert.match(text('dist/preview/game.html'),/细沙预览 0\.4\.0/);
 assert.match(text('README.md'),/^# .*0\.4\.0/);assert.match(text('VALIDATION.md'),/^# .*0\.4\.0/);assert.match(text('PREVIEW-NOTES.md'),/0\.4\.0 保留/);
});
test('Help discloses the new fine-game rule while the preserved default game keeps its own rule',()=>{
 const fine=text('dist/preview/game.html');assert.match(fine,/上下左右或斜角相接都算连通/);assert.match(fine,/同一个连通区域同时碰到左右两面墙/);assert.match(fine,/隔着空格或其他颜色不会连通/);assert(!fine.includes('斜角相接不算'));
 assert.match(text('dist/index.html'),/斜角相接不算/);assert.match(text('dist/preview/app.js'),/grainform\.preview\.v1\.preferences/);assert.match(text('dist/preview/app.js'),/grainform\.preview\.v1\.best/);
});
