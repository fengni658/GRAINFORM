import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GPU_CONTRACT, GPU_KERNEL_INVARIANTS, POSITION_ENCODING } from '../gpu-solver.mjs';
import { GPU_CONTRACT as BASE_CONTRACT, POSITION_ENCODING as BASE_ENCODING } from '../baseline-core/gpu-solver.mjs';
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [project, baselineProject, main, baselineMain, velocity, remove, predict, manifestText] = await Promise.all([
  'shaders/project.frag.glsl', 'baseline-core/shaders/project.frag.glsl',
  'gpu-solver.mjs', 'baseline-core/gpu-solver.mjs',
  'shaders/velocity.frag.glsl', 'shaders/remove.frag.glsl', 'shaders/predict.frag.glsl', 'PUBLIC-BASELINE-HASHES.json',
].map(read));
const manifest = JSON.parse(manifestText);
const sha = value => createHash('sha256').update(value).digest('hex');
const once = (text, from, to) => {
  assert.equal(text.split(from).length - 1, 1, `Expected exactly one proven substitution: ${from}`);
  return text.replace(from, to);
};

test('allActive is an explicit frozen, unsupported-sleep/external-write contract', () => {
  assert.ok(Object.isFrozen(GPU_KERNEL_INVARIANTS));
  assert.equal(GPU_KERNEL_INVARIANTS.allActive, true);
  assert.equal(GPU_KERNEL_INVARIANTS.acceptsSleepingInputs, false);
  assert.equal(GPU_KERNEL_INVARIANTS.externalVelocityTextureWritesSupported, false);
  assert.equal(GPU_KERNEL_INVARIANTS.requiresStockShaderSources, true);
  assert.equal(GPU_CONTRACT.sleepImplemented, false);
  assert.match(main, /if \(!GPU_KERNEL_INVARIANTS.allActive \|\| GPU_CONTRACT.sleepImplemented\)/);
  assert.match(main, /p\.sleep !== undefined && p\.sleep !== false/);
  assert.match(main, /p\.quiet !== undefined && p\.quiet !== 0/);
  assert.match(main, /External velocity writes are unsupported/);
  assert.match(project, /Restore sleep-aware neighbor weight and relative displacement before enabling sleep/);
});

test('every stock velocity writer establishes or preserves z=0', () => {
  assert.match(main, /velocity\.set\(\[p\.vx, p\.vy, 0, 0\], i \* 4\)/);
  assert.match(main, /data \?\? new Float32Array\(width \* height \* 4\)/);
  assert.deepEqual([...velocity.matchAll(/outVelocity\s*=\s*([^;]+);/g)].map(m => m[1].trim()), ['vec4(0.0)', 'vec4(v, 0.0, 0.0)']);
  assert.deepEqual([...remove.matchAll(/outVelocity\s*=\s*([^;]+);/g)].map(m => m[1].trim()), ['v']);
  assert.match(remove, /vec4 v = texelFetch\(uVelocity, at, 0\);/);
  assert.doesNotMatch(predict, /outVelocity|\.z\s*=/);
  assert.deepEqual([...main.matchAll(/this\.currentVelocity\s*=\s*([^;]+);/g)].map(m => m[1].trim()), ['this.velocities[0]', 'velocity', 'velocity']);
});

test('shader equals baseline under only the proven neighborSleeping=false substitution', () => {
  let expected = once(baselineProject, 'uniform sampler2D uVelocity;\n', '');
  expected = once(expected, '          bool neighborSleeping = texelFetch(uVelocity, otherAt, 0).z > 0.5;\n', '');
  expected = once(expected, 'neighborSleeping ? 1.0 : dynamicWeight', 'dynamicWeight');
  expected = once(expected, '(neighborSleeping ? vec2(0.0) : positionDifference(q, texelFetch(uPrevious, otherAt, 0)))', 'positionDifference(q, texelFetch(uPrevious, otherAt, 0))');
  expected = once(expected, 'uniform sampler2D uPosition;', '// AWAKE_ONLY: stock constructor/reconstruction keep velocity.z zero; removal copies it.\n// Restore sleep-aware neighbor weight and relative displacement before enabling sleep.\nuniform sampler2D uPosition;');
  assert.equal(project, expected, 'No material, arithmetic ordering, geometry, precision, bucket, or diagnostic edits are allowed');
  assert.equal((baselineProject.match(/texelFetch\(uVelocity, otherAt, 0\)/g) ?? []).length, 1);
  assert.doesNotMatch(project, /uVelocity|neighborSleeping/);
  assert.equal((baselineProject.match(/uniform sampler2D/g) ?? []).length, 7);
  assert.equal((project.match(/uniform sampler2D/g) ?? []).length, 6);
});

test('material, step/pass, cell-local encoding and unchanged kernels remain identical', async () => {
  assert.deepEqual(GPU_CONTRACT, BASE_CONTRACT);
  assert.deepEqual(POSITION_ENCODING, BASE_ENCODING);
  const unchanged = ['shaders/bucket.vert.glsl','shaders/bucket.frag.glsl','shaders/predict.frag.glsl','shaders/velocity.frag.glsl','shaders/remove.frag.glsl','shaders/fullscreen.vert.glsl','reference.mjs','physical-gates.mjs','fixtures.mjs','probe.mjs'];
  for (const path of unchanged) assert.equal(sha(await read(path)), manifest.baselineFileHashes[path], `${path} must be byte-identical to baseline`);
  assert.equal(sha(baselineMain), manifest.baselineFileHashes['gpu-solver.mjs']);
  assert.equal(sha(baselineProject), manifest.baselineFileHashes['shaders/project.frag.glsl']);
  const body = main.slice(main.indexOf('this._use(this.programs.project'), main.indexOf('this._drawFullscreen();', main.indexOf('this._use(this.programs.project')));
  assert.doesNotMatch(body, /uVelocity/);
  assert.equal((body.match(/\['u(?:Position|GridPosition|EvenBuckets|OddBuckets|Diagnostics|Previous)'/g) ?? []).length, 6);
});


test('host orchestration changes only the removed sampler and explicit specialization guards', () => {
  let expected = once(baselineMain,
    "['uVelocity', this.currentVelocity], ['uEvenBuckets', this.buckets[0]],",
    "['uEvenBuckets', this.buckets[0]],");
  expected = once(expected, 'export const GPU_CONTRACT = Object.freeze({',
    '// This specialization is valid only while every solver-owned velocity.z remains zero.\n// Before adding real sleep, restore the general neighbor weight/displacement path.\nexport const GPU_KERNEL_INVARIANTS = Object.freeze({\n  allActive: true,\n  acceptsSleepingInputs: false,\n  externalVelocityTextureWritesSupported: false,\n  requiresStockShaderSources: true,\n});\nexport const GPU_CONTRACT = Object.freeze({');
  const inputCheck = '    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new TypeError(`Particle ${index} requires finite x/y`);';
  expected = once(expected, inputCheck,
    inputCheck + '\n    if (p.sleep !== undefined && p.sleep !== false) throw new TypeError(`All-active kernel rejects particle ${index}: sleep must be false or omitted`);\n    if (p.quiet !== undefined && p.quiet !== 0) throw new TypeError(`All-active kernel rejects particle ${index}: quiet must be 0 or omitted`);');
  const constructor = '  constructor(gl, particles, { passes = 64, shock = true, sources, stateWidth } = {}) {';
  expected = once(expected, constructor,
    constructor + "\n    if (!GPU_KERNEL_INVARIANTS.allActive || GPU_CONTRACT.sleepImplemented) {\n      throw new Error('Restore the general sleeping-neighbor projection kernel before enabling sleep.');\n    }");
  expected = once(expected,
    '  /** GPU-resident handles for a renderer in the same context. No synchronization. */',
    '  /** Read-only GPU texture handles for rendering. External velocity writes are unsupported\n   * and violate the allActive specialization. No synchronization or mutation permission. */');
  assert.equal(main, expected);
});
