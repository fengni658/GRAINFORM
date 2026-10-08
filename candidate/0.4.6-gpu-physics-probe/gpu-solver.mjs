/**
 * Independent WebGL2 floating-point PBD/Jacobi probe. Not the legacy serial solver.
 * The context is owned exclusively by this class; it does not restore caller GL state.
 * createGPUWorld() loads adjacent GLSL files. step() never reads GPU state to the CPU.
 */
export const GPU_CONTRACT = Object.freeze({
  version: '0.4.6-gpu-float-probe-2',
  radius: 0.875, diameter: 1.75, displayRadius: 0.87,
  left: 28, right: 260, floor: 420,
  fixedDt: 1 / 120, substeps: 2, subDt: 1 / 240,
  gravity: 240, vyCap: 60, contactSkin: 0.004,
  contactDivisor: 0.75, iterationCap: 0.125,
  contactDamping: 0.75, floorFriction: 0.7, tangentialFriction: 0.15,
  cell: 4, gridOriginX: 28, gridOriginY: -16,
  gridCols: 58, gridRows: 110, bucketCapacity: 16,
  bucketLayers: 17, atlasLayers: 9, driftLimit: 1,
  sleepImplemented: false, defaultShock: true, shockStartIteration: 8, shockHeightBias: 1.5, validPasses: Object.freeze([16, 32, 64]),
});
export const SHADER_FILES = Object.freeze([
  'fullscreen.vert.glsl', 'predict.frag.glsl', 'bucket.vert.glsl',
  'bucket.frag.glsl', 'project.frag.glsl', 'velocity.frag.glsl', 'remove.frag.glsl',
]);

export async function loadShaderSources(baseURL = new URL('./shaders/', import.meta.url), fetcher = globalThis.fetch) {
  if (typeof fetcher !== 'function') throw new Error('Shader loading needs fetch or options.sources.');
  const entries = await Promise.all(SHADER_FILES.map(async name => {
    const response = await fetcher(new URL(name, baseURL));
    if (!response.ok) throw new Error(`Cannot load shader ${name}: HTTP ${response.status}`);
    return [name, await response.text()];
  }));
  return Object.fromEntries(entries);
}

export async function createGPUWorld(gl, particles, options = {}) {
  const sources = options.sources ?? await loadShaderSources(options.shaderBaseURL, options.fetcher);
  return new GPUWorld(gl, particles, { ...options, sources });
}

function compileProgram(gl, vertex, fragment, label) {
  const shaders = [];
  const program = gl.createProgram();
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      if (typeof source !== 'string') throw new Error(`Missing source for ${label}`);
      const shader = gl.createShader(type);
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(`${label} shader compile failed: ${gl.getShaderInfoLog(shader)}`);
      }
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`${label} program link failed: ${gl.getProgramInfoLog(program)}`);
    return { program, locations: new Map(), label };
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally { for (const shader of shaders) gl.deleteShader(shader); }
}

function normalizeParticles(particles) {
  if (!Array.isArray(particles)) throw new TypeError('particles must be an array');
  const ids = new Set();
  return particles.map((p, index) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new TypeError(`Particle ${index} requires finite x/y`);
    const id = p.id ?? index;
    if (ids.has(id)) throw new TypeError(`Duplicate particle id: ${id}`);
    ids.add(id);
    const vx = p.vx ?? 0, vy = p.vy ?? 0, color = p.color ?? 1;
    if (!Number.isFinite(vx) || !Number.isFinite(vy)) throw new TypeError(`Particle ${index} has non-finite velocity`);
    if (!Number.isInteger(color) || color < 1 || color > 4) throw new TypeError(`Particle ${index} color must be an integer from 1 through 4`);
    if (Math.abs(vx) > 60 || Math.abs(vy) > 60) throw new RangeError(`Particle ${index} input velocity must satisfy |vx|, |vy| <= 60`);
    return { id, x: p.x, y: p.y, vx, vy, color, alive: p.alive !== false, sleep: false, quiet: 0 };
  });
}

export class GPUWorld {
  constructor(gl, particles, { passes = 64, shock = true, sources, stateWidth } = {}) {
    if (!gl || typeof gl.drawBuffers !== 'function' || typeof gl.texStorage2D !== 'function') throw new TypeError('A WebGL2 context is required');
    if (!GPU_CONTRACT.validPasses.includes(passes)) throw new RangeError('passes must be 16, 32, or 64');
    if (typeof shock !== 'boolean') throw new TypeError('shock must be a boolean');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('EXT_color_buffer_float is required; there is no CPU fallback in this class.');
    this.gl = gl;
    this.passes = passes;
    this.shock = shock;
    this.contract = GPU_CONTRACT;
    this.metadata = normalizeParticles(particles);
    this.count = this.metadata.length;
    if (this.count > 1048576) throw new RangeError('Particle count exceeds the conservatively bounded 24-bit depth ID range.');
    this.steps = 0;
    this.substeps = 0;
    this.drawCalls = 0;
    this.readbackCount = 0;
    this.stateRevision = 0;
    this.idToSlot = new Map(this.metadata.map((p, i) => [p.id, i]));
    this.disposed = false;
    this.lastDiagnostics = null;
    this._textures = [];
    this._framebuffers = [];
    this._renderbuffers = [];
    this._programs = [];
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    if (maxTextureSize < GPU_CONTRACT.gridRows * GPU_CONTRACT.atlasLayers) throw new Error('Texture size is insufficient for the bucket atlas.');
    const defaultWidth = Math.min(maxTextureSize, 2 ** Math.ceil(Math.log2(Math.max(1, Math.ceil(Math.sqrt(this.count))))));
    this.width = stateWidth ?? defaultWidth;
    this.height = Math.max(1, Math.ceil(this.count / this.width));
    if (!Number.isInteger(this.width) || this.width < 1 || this.width > maxTextureSize || this.height > maxTextureSize) throw new RangeError('Invalid state texture dimensions');
    if (gl.getParameter(gl.MAX_DRAW_BUFFERS) < 2 || gl.getParameter(gl.MAX_COLOR_ATTACHMENTS) < 2) throw new Error('Two float render targets are required.');
    if (gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) < 7) throw new Error('Seven fragment texture units are required.');
    const makeProgram = (vert, frag, label) => {
      const p = compileProgram(gl, sources?.[vert], sources?.[frag], label);
      this._programs.push(p);
      return p;
    };
    try {
      this.programs = {
        predict: makeProgram('fullscreen.vert.glsl', 'predict.frag.glsl', 'predict'),
        bucket: makeProgram('bucket.vert.glsl', 'bucket.frag.glsl', 'bucket depth peel'),
        project: makeProgram('fullscreen.vert.glsl', 'project.frag.glsl', 'Jacobi projection'),
        velocity: makeProgram('fullscreen.vert.glsl', 'velocity.frag.glsl', 'velocity reconstruction'),
        remove: makeProgram('fullscreen.vert.glsl', 'remove.frag.glsl', 'online removal'),
      };
      const position = new Float32Array(this.width * this.height * 4);
      const velocity = new Float32Array(position.length);
      for (let i = 0; i < this.count; ++i) {
        const p = this.metadata[i];
        position.set([p.x, p.y, p.alive ? 1 : 0, 0], i * 4);
        velocity.set([p.vx, p.vy, 0, 0], i * 4);
      }
      this.positions = [this._texture(this.width, this.height, position), this._texture(this.width, this.height)];
      this.velocities = [this._texture(this.width, this.height, velocity), this._texture(this.width, this.height)];
      this.diagnosticTextures = [this._texture(this.width, this.height), this._texture(this.width, this.height)];
      this.gridPosition = this._texture(this.width, this.height);
      this.previousPosition = this._texture(this.width, this.height);
      this.removeMask = this._texture(this.width, this.height);
      this.currentPosition = this.positions[0];
      this.currentVelocity = this.velocities[0];
      this.currentDiagnostics = this.diagnosticTextures[0];
      this.buckets = [this._texture(GPU_CONTRACT.gridCols, GPU_CONTRACT.gridRows * GPU_CONTRACT.atlasLayers), this._texture(GPU_CONTRACT.gridCols, GPU_CONTRACT.gridRows * GPU_CONTRACT.atlasLayers)];
      this.passFramebuffer = this._framebuffer();
      this.readFramebuffer = this._framebuffer();
      this.bucketDepth = gl.createRenderbuffer();
      this._renderbuffers.push(this.bucketDepth);
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.bucketDepth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, GPU_CONTRACT.gridCols, GPU_CONTRACT.gridRows * GPU_CONTRACT.atlasLayers);
      this.bucketFramebuffers = this.buckets.map(texture => {
        const framebuffer = this._framebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.bucketDepth);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
        this._checkFramebuffer('bucket');
        return framebuffer;
      });
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.DITHER);
      gl.disable(gl.SCISSOR_TEST);
      gl.colorMask(true, true, true, true);
      this._target([this.currentPosition, this.currentDiagnostics]);
      this._checkFramebuffer('RGBA32F MRT');
    } catch (error) { this.dispose(); throw error; }
  }

  _assertUsable() {
    if (this.disposed) throw new Error('GPUWorld has been disposed');
    if (this.gl.isContextLost()) throw new Error('WebGL context was lost; no completed GPU result is available.');
  }
  _texture(width, height, data = null) {
    const gl = this.gl, texture = gl.createTexture();
    this._textures.push(texture);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, width, height);
    // Explicit zero initialization rather than relying on driver allocation behavior.
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.FLOAT, data ?? new Float32Array(width * height * 4));
    return texture;
  }
  _framebuffer() { const f = this.gl.createFramebuffer(); this._framebuffers.push(f); return f; }
  _checkFramebuffer(label) {
    const gl = this.gl, status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`${label} framebuffer is incomplete: 0x${status.toString(16)}`);
  }
  _target(textures) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.passFramebuffer);
    for (let i = 0; i < 2; ++i) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, textures[i] ?? null, 0);
    gl.drawBuffers(textures.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
  }
  _use(program, samplers, values = {}) {
    const gl = this.gl;
    gl.useProgram(program.program);
    const location = name => {
      if (!program.locations.has(name)) program.locations.set(name, gl.getUniformLocation(program.program, name));
      return program.locations.get(name);
    };
    samplers.forEach(([name, texture], index) => {
      gl.activeTexture(gl.TEXTURE0 + index);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(location(name), index);
    });
    for (const [name, descriptor] of Object.entries(values)) {
      const [type, value] = descriptor;
      if (type === 'i') gl.uniform1i(location(name), value);
      else if (type === 'f') gl.uniform1f(location(name), value);
      else if (type === 'i2') gl.uniform2i(location(name), value[0], value[1]);
      else if (type === 'f2') gl.uniform2f(location(name), value[0], value[1]);
      else throw new Error(`Unknown uniform type ${type}`);
    }
  }
  _drawFullscreen() { this.gl.drawArrays(this.gl.TRIANGLES, 0, 3); this.drawCalls++; }
  _other(pair, current) { return current === pair[0] ? pair[1] : pair[0]; }
  _gridUniforms() {
    const c = GPU_CONTRACT;
    return { uStateSize: ['i2', [this.width, this.height]], uGridSize: ['i2', [c.gridCols, c.gridRows]], uGridOrigin: ['f2', [c.gridOriginX, c.gridOriginY]], uCell: ['f', c.cell], uCount: ['i', this.count] };
  }
  _buildBuckets() {
    const gl = this.gl, c = GPU_CONTRACT;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.enable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    for (let layer = 0; layer < c.bucketLayers; ++layer) {
      const parity = layer % 2, y = Math.floor(layer / 2) * c.gridRows;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bucketFramebuffers[parity]);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      gl.viewport(0, y, c.gridCols, c.gridRows);
      gl.scissor(0, y, c.gridCols, c.gridRows);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // Previous and output layers are always in different textures: no framebuffer feedback.
      this._use(this.programs.bucket, [['uGridPosition', this.gridPosition], ['uPreviousLayer', this.buckets[1 - parity]]], { ...this._gridUniforms(), uLayer: ['i', layer] });
      gl.drawArrays(gl.POINTS, 0, this.count);
      this.drawCalls++;
    }
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.DEPTH_TEST);
  }
  _substep() {
    const c = GPU_CONTRACT;
    this._target([this.gridPosition, this.previousPosition]);
    this._use(this.programs.predict, [['uPosition', this.currentPosition], ['uVelocity', this.currentVelocity]], { uDt: ['f', c.subDt], uGravity: ['f', c.gravity], uVyCap: ['f', c.vyCap] });
    this._drawFullscreen();
    this._buildBuckets();
    let input = this.gridPosition;
    for (let iteration = 0; iteration < this.passes; ++iteration) {
      const output = input === this.positions[0] ? this.positions[1] : this.positions[0];
      const nextDiagnostics = this._other(this.diagnosticTextures, this.currentDiagnostics);
      this._target([output, nextDiagnostics]);
      this._use(this.programs.project, [
        ['uPosition', input], ['uGridPosition', this.gridPosition],
        ['uVelocity', this.currentVelocity], ['uEvenBuckets', this.buckets[0]],
        ['uOddBuckets', this.buckets[1]], ['uDiagnostics', this.currentDiagnostics], ['uPrevious', this.previousPosition],
      ], { ...this._gridUniforms(), uRadius: ['f', c.radius], uDiameter: ['f', c.diameter], uContactSkin: ['f', c.contactSkin], uLeft: ['f', c.left], uRight: ['f', c.right], uFloor: ['f', c.floor], uIterationCap: ['f', c.iterationCap], uContactDivisor: ['f', c.contactDivisor], uTangentialFriction: ['f', c.tangentialFriction], uShock: ['i', this.shock && iteration >= c.shockStartIteration ? 1 : 0], uShockHeightBias: ['f', c.shockHeightBias] });
      this._drawFullscreen();
      input = output;
      this.currentDiagnostics = nextDiagnostics;
    }
    this.currentPosition = input;
    const velocity = this._other(this.velocities, this.currentVelocity);
    this._target([velocity]);
    this._use(this.programs.velocity, [['uPosition', this.currentPosition], ['uPrevious', this.previousPosition]], { uDt: ['f', c.subDt], uContactDamping: ['f', c.contactDamping], uFloorFriction: ['f', c.floorFriction], uFloor: ['f', c.floor], uRadius: ['f', c.radius] });
    this._drawFullscreen();
    this.currentVelocity = velocity;
    this.substeps++;
  }

  /** Submit exactly n fixed steps. No timer accumulation and no CPU state readback. */
  step(n = 1) {
    this._assertUsable();
    if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('step count must be a nonnegative safe integer');
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DITHER);
    gl.colorMask(true, true, true, true);
    for (let i = 0; i < n; ++i) {
      if (this.count > 0) for (let sub = 0; sub < GPU_CONTRACT.substeps; ++sub) this._substep();
      else this.substeps += GPU_CONTRACT.substeps;
      this.steps++;
      this.stateRevision++;
    }
    return { submittedSteps: n, steps: this.steps, substeps: this.substeps, readback: false, gpuCompletionVerified: false };
  }

  /** Remove known IDs online with a GPU mask pass. Stable slots, no CPU position readback. */
  remove(ids) {
    this._assertUsable();
    if (!Array.isArray(ids)) throw new TypeError('remove(ids) expects an array of particle IDs');
    const slots = [...new Set(ids)].map(id => {
      if (!this.idToSlot.has(id)) throw new RangeError(`Unknown particle ID: ${id}`);
      return this.idToSlot.get(id);
    }).filter(slot => this.metadata[slot].alive);
    if (!slots.length) return { removedIds: [], readback: false, gpuCompletionVerified: false };
    const gl = this.gl, mask = new Float32Array(this.width * this.height * 4);
    for (const slot of slots) mask[slot * 4] = 1;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.removeMask);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.height, gl.RGBA, gl.FLOAT, mask);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DITHER);
    gl.colorMask(true, true, true, true);
    const position = this._other(this.positions, this.currentPosition);
    const velocity = this._other(this.velocities, this.currentVelocity);
    this._target([position, velocity]);
    this._use(this.programs.remove, [['uPosition', this.currentPosition], ['uVelocity', this.currentVelocity], ['uRemoveMask', this.removeMask]]);
    this._drawFullscreen();
    this.currentPosition = position;
    this.currentVelocity = velocity;
    this.stateRevision++;
    const removedIds = slots.map(slot => { this.metadata[slot].alive = false; return this.metadata[slot].id; });
    return { removedIds, preservedSlots: true, readback: false, gpuCompletionVerified: false };
  }

  /** GPU-resident handles for a renderer in the same context. No synchronization. */
  getGPUState() {
    this._assertUsable();
    return { positionTexture: this.currentPosition, velocityTexture: this.currentVelocity, diagnosticsTexture: this.currentDiagnostics, gridPositionTexture: this.gridPosition, bucketTextures: this.buckets.slice(), width: this.width, height: this.height, count: this.count, metadata: this.metadata.map(({ id, color }) => ({ id, color })), steps: this.steps, substeps: this.substeps };
  }
  get diagnostics() {
    if (!this.lastDiagnostics) return { status: 'unread', invalid: null, overflow: null, outOfGrid: null, maxDrift: null, sleepImplemented: false, shock: this.shock, passes: this.passes, pendingGPUReadback: true };
    return { ...this.lastDiagnostics, pendingGPUReadback: this.lastDiagnostics.measuredAtRevision !== this.stateRevision };
  }
  _readTexture(texture, width = this.width, height = this.height) {
    const gl = this.gl, data = new Float32Array(width * height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.readFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, data);
    const error = gl.getError();
    if (error !== gl.NO_ERROR) throw new Error(`GPU readback failed: GL error 0x${error.toString(16)}`);
    return data;
  }
  /** Explicit QA readback. readPixels synchronizes the relevant GPU work. */
  readback({ raw = false, includeBuckets = false } = {}) {
    this._assertUsable();
    const positions = this._readTexture(this.currentPosition);
    const velocities = this._readTexture(this.currentVelocity);
    const diagnosticData = this._readTexture(this.currentDiagnostics);
    this.readbackCount++;
    let maxDrift = 0, overflowParticles = 0, outOfGridParticles = 0, nonFiniteParticles = 0;
    const particles = this.metadata.map((meta, i) => {
      const at = i * 4;
      maxDrift = Math.max(maxDrift, diagnosticData[at]);
      if (diagnosticData[at + 1] > 0.5) overflowParticles++;
      if (diagnosticData[at + 2] > 0.5) outOfGridParticles++;
      if (diagnosticData[at + 3] > 0.5 || !Number.isFinite(positions[at]) || !Number.isFinite(positions[at + 1]) || !Number.isFinite(velocities[at]) || !Number.isFinite(velocities[at + 1])) nonFiniteParticles++;
      return { ...meta, x: positions[at], y: positions[at + 1], vx: velocities[at], vy: velocities[at + 1], alive: positions[at + 2] > 0.5, touched: positions[at + 3] > 0.5, sleep: false, quiet: 0 };
    });
    this.lastDiagnostics = {
      status: 'measured', overflow: overflowParticles > 0, overflowParticles,
      outOfGrid: outOfGridParticles > 0, outOfGridParticles,
      maxDrift, driftLimit: GPU_CONTRACT.driftLimit, driftExceeded: maxDrift > GPU_CONTRACT.driftLimit,
      nonFiniteParticles, invalid: overflowParticles > 0 || outOfGridParticles > 0 || nonFiniteParticles > 0 || !Number.isFinite(maxDrift) || maxDrift > GPU_CONTRACT.driftLimit,
      stickySinceCreation: true, sleepImplemented: false, shock: this.shock, passes: this.passes,
      measuredAtSteps: this.steps, measuredAtSubsteps: this.substeps, measuredAtRevision: this.stateRevision, gpuCompletionVerified: true,
    };
    const result = { particles, diagnostics: { ...this.lastDiagnostics }, steps: this.steps, substeps: this.substeps, drawCalls: this.drawCalls };
    if (raw) result.raw = { positions, velocities, diagnostics: diagnosticData, gridPositions: this._readTexture(this.gridPosition), previousPositions: this._readTexture(this.previousPosition) };
    if (includeBuckets) result.buckets = this.buckets.map(t => this._readTexture(t, GPU_CONTRACT.gridCols, GPU_CONTRACT.gridRows * GPU_CONTRACT.atlasLayers));
    return result;
  }
  /** Explicit completion barrier. Never called from step(). */
  finish() { this._assertUsable(); this.gl.finish(); return { steps: this.steps, substeps: this.substeps, gpuCompletionVerified: true }; }
  /** Fixed-step completed-work benchmark, not display FPS. Mutates the world. */
  benchmark({ steps = 120, warmup = 1 } = {}) {
    if (!Number.isSafeInteger(steps) || steps < 1 || !Number.isSafeInteger(warmup) || warmup < 0) throw new RangeError('Invalid benchmark steps/warmup');
    this.step(warmup); this.finish();
    const start = performance.now();
    this.step(steps);
    const submitted = performance.now();
    this.finish();
    const end = performance.now();
    return { steps, warmup, particleCount: this.count, passes: this.passes, shock: this.shock, cpuSubmissionMs: submitted - start, completedWallMs: end - start, completedStepsPerSecond: steps / ((end - start) / 1000), displayFPS: null, synchronizedWith: 'gl.finish', readbackIncluded: false, platformDependent: true };
  }
  dispose() {
    if (this.disposed) return;
    const gl = this.gl;
    for (const p of this._programs ?? []) gl.deleteProgram(p.program);
    for (const t of this._textures ?? []) gl.deleteTexture(t);
    for (const f of this._framebuffers ?? []) gl.deleteFramebuffer(f);
    for (const r of this._renderbuffers ?? []) gl.deleteRenderbuffer(r);
    if (this.vao) gl.deleteVertexArray(this.vao);
    this.disposed = true;
  }
}
