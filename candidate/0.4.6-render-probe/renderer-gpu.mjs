/** GRAINFORM 0.4.6 direct-canvas WebGL2 renderer.
 * One real octagon per supplied physical body, no sprites, texture impostors,
 * readback or physics changes. Call render() only when the app chooses; this
 * module owns no RAF, timer, queue, worker or game clock.
 *
 * Design references (API contracts, no third-party code copied):
 * https://registry.khronos.org/webgl/specs/latest/2.0/
 * https://registry.khronos.org/webgl/specs/latest/1.0/#5.15.2
 */
export const WIDTH = 288, HEIGHT = 432, GRAIN_R = .870, BLOCK = 24;
export const INSTANCE_FLOATS = 5;
export const PALETTES = Object.freeze({
  standard: Object.freeze(['', '#eac370', '#4fc0b3', '#d378a3', '#789fef']),
  contrast: Object.freeze(['', '#ffe07a', '#4df0b0', '#fc87b5', '#71a7ff'])
});
const EMPTY = Object.freeze([]);

// Round toward the center, never outside the requested circumscribed circle.
// The maximum inward error is less than one Float32 ULP per coordinate.
function inwardFloat(value) {
  const rounded = Math.fround(value);
  return rounded > value ? Math.fround(rounded - 2 ** (Math.floor(Math.log2(value)) - 23)) : rounded;
}
export function createOctagonMesh() {
  const a = inwardFloat(GRAIN_R * Math.cos(Math.PI / 8));
  const b = inwardFloat(GRAIN_R * Math.sin(Math.PI / 8));
  // TRIANGLE_FAN: center, eight genuine outline vertices, repeat first to close.
  return new Float32Array([0, 0, a, b, b, a, -b, a, -a, b, -a, -b, -b, -a, b, -a, a, -b, a, b]);
}
function rgb(hex) {
  if (typeof hex !== 'string' || !/^#[\da-f]{6}$/i.test(hex)) throw new TypeError('Renderer colors must use six-digit #RRGGBB values');
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}
function resolvePalette(palette = 'standard') {
  if (typeof palette === 'string') {
    if (!Object.hasOwn(PALETTES, palette)) throw new TypeError(`Unknown renderer palette: ${palette}`);
    return PALETTES[palette];
  }
  if (!Array.isArray(palette) || palette.length !== 5) throw new TypeError('Palette must be standard, contrast, or a five-entry array indexed 1–4');
  return palette;
}

/** Reusable CPU staging buffer; Float32 conversion is rendering-only.
 * fill() never filters, subsamples, sorts, modifies or invents physical bodies.
 * Activity glyphs are separately counted, preserving the old 13 x 13 style.
 */
export class InstanceBatch {
  constructor(initialCapacity = 8192) {
    if (!Number.isSafeInteger(initialCapacity) || initialCapacity < 0) throw new RangeError('Invalid instance capacity');
    this.capacity = Math.max(1, initialCapacity);
    this.data = new Float32Array(this.capacity * INSTANCE_FLOATS);
    this.physicalCount = this.activeGlyphCount = this.count = 0;
    this.paletteKey = ''; this.colors = null;
  }
  fill(snapshot, palette = 'standard') {
    const source = resolvePalette(palette), key = source.slice(1).join('|');
    if (this.paletteKey !== key) { this.colors = [null, ...source.slice(1).map(rgb)]; this.paletteKey = key; }
    const bodies = snapshot?.bodies ?? EMPTY, active = snapshot?.active;
    if (!Array.isArray(bodies)) throw new TypeError('snapshot.bodies must be an array');
    const shape = active?.shape ?? EMPTY;
    if (!Array.isArray(shape)) throw new TypeError('active.shape must be an array');
    const activeCount = shape.length * 13 * 13, count = bodies.length + activeCount;
    if (!Number.isSafeInteger(count)) throw new RangeError('Invalid instance count');
    if (count > this.capacity) {
      // High-water allocation, not a per-frame allocation or a hidden count cap.
      let capacity = this.capacity;
      while (capacity < count) capacity *= 2;
      this.data = new Float32Array(capacity * INSTANCE_FLOATS); this.capacity = capacity;
    }
    const data = this.data, colors = this.colors;
    let offset = 0;
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i], c = colors[body?.color];
      if (!c || !Number.isFinite(body.x) || !Number.isFinite(body.y)) throw new TypeError(`Invalid physical body at index ${i}; frame rejected without dropping a body`);
      data[offset++] = body.x; data[offset++] = body.y;
      data[offset++] = c[0]; data[offset++] = c[1]; data[offset++] = c[2];
    }
    if (activeCount) {
      const c = typeof active.color === 'string' ? rgb(active.color) : colors[active.color];
      if (!c || !Number.isFinite(active.x) || !Number.isFinite(active.y)) throw new TypeError('Invalid active piece');
      for (const cell of shape) {
        if (!Array.isArray(cell) || !Number.isFinite(cell[0]) || !Number.isFinite(cell[1])) throw new TypeError('Invalid active piece cell');
        const x = active.x + cell[0] * BLOCK, y = active.y + cell[1] * BLOCK;
        for (let gy = 0; gy < 13; gy++) for (let gx = 0; gx < 13; gx++) {
          data[offset++] = x + (gx + .5) * BLOCK / 13;
          data[offset++] = y + (gy + .5) * BLOCK / 13;
          data[offset++] = c[0]; data[offset++] = c[1]; data[offset++] = c[2];
        }
      }
    }
    this.physicalCount = bodies.length; this.activeGlyphCount = activeCount; this.count = count;
    return this;
  }
}

// Static frame geometry is uploaded only on initialization/restoration.
export function createFrameMesh() {
  const vertices = [], guide = rgb('#182322'), wall = rgb('#2c3a36'), edge = rgb('#586753');
  const rect = (x, y, w, h, color) => {
    for (const [vx, vy] of [[x, y], [x + w, y], [x, y + h], [x, y + h], [x + w, y], [x + w, y + h]]) vertices.push(vx, vy, ...color);
  };
  for (let y = 36; y < 420; y += 24) { rect(12, y, 4, .7, guide); rect(272, y, 4, .7, guide); }
  rect(24, 0, 4, 424, wall); rect(260, 0, 4, 424, wall); rect(24, 420, 240, 4, wall);
  rect(27, 0, 1, 420, edge); rect(260, 0, 1, 420, edge); rect(28, 420, 232, 1, edge);
  return new Float32Array(vertices);
}
const GRAIN_VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec2 localPosition;
layout(location=1) in vec2 center;
layout(location=2) in vec3 color;
out vec3 vColor;
out vec2 vWorld;
void main() {
  vWorld = center + localPosition;
  vColor = color;
  gl_Position = vec4(vWorld.x / 144.0 - 1.0, 1.0 - vWorld.y / 216.0, 0.0, 1.0);
}`;
const GRAIN_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vColor;
in vec2 vWorld;
out vec4 outColor;
void main() {
  // Exact logical playfield clip, including fractional-DPR pixel boundaries.
  if (vWorld.x < 28.0 || vWorld.x >= 260.0 || vWorld.y < 0.0 || vWorld.y >= 420.0) discard;
  outColor = vec4(vColor, 1.0);
}`;
const FRAME_VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec2 position;
layout(location=1) in vec3 color;
out vec3 vColor;
void main() {
  vColor = color;
  gl_Position = vec4(position.x / 144.0 - 1.0, 1.0 - position.y / 216.0, 0.0, 1.0);
}`;
const FRAME_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vColor;
out vec4 outColor;
void main() { outColor = vec4(vColor, 1.0); }
`;
const clock = () => globalThis.performance?.now() ?? Date.now();

/**
 * createRenderer(canvas, { onStateChange })
 *
 * Call before acquiring ANY context on canvas. No Canvas2D context is taken.
 * A failed initialization returns ok:false + reason + requiresFreshCanvas.
 * Once GL was acquired, a Canvas2D fallback MUST use a replacement canvas.
 *
 * render(snapshot, { palette:'standard'|'contrast'|indexedHexArray, dpr,
 *                    cssWidth }) -> { ok, physicalCount, activeGlyphCount,
 *                    instanceCount, cpuSubmissionMs, drawCalls, ... }
 * cssWidth is optional; passing the ResizeObserver width avoids layout reads.
 * dpr defaults to devicePixelRatio, capped at 3 like the prior Canvas renderer.
 *
 * Context loss: render returns recoverable:true. Context restoration rebuilds
 * all GL objects and calls onStateChange({state:'ready', restored:true}); the
 * caller should request one new draw, even if gameplay is paused. No timer runs.
 *
 * CPU submission timings do NOT measure GPU completion or presented frame rate.
 */
export function createRenderer(canvas, { onStateChange } = {}) {
  let gl;
  const failure = (reason, requiresFreshCanvas) => ({ ok: false, kind: 'unavailable', state: 'failed', reason, requiresFreshCanvas });
  if (!canvas || typeof canvas.getContext !== 'function') return failure('A canvas is required', false);
  try {
    gl = canvas.getContext('webgl2', { alpha: false, antialias: true, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  } catch (error) { return failure(`WebGL2 context creation failed: ${error?.message || error}`, false); }
  if (!gl) return failure('WebGL2 is unavailable or canvas already owns another context', false);

  let state = 'initializing', reason = '', resources = null, disposed = false, lostCount = 0, restoredCount = 0;
  const batch = new InstanceBatch(), samples = new Float64Array(240);
  let sampleCount = 0, sampleIndex = 0, frames = 0, maxSubmissionMs = 0, last = null;
  let antialias = null;
  const notify = details => { if (typeof onStateChange === 'function') onStateChange({ state, reason, ...details }); };
  function deleteResources() {
    if (!resources) return;
    for (const item of resources.buffers) gl.deleteBuffer(item);
    for (const item of resources.vaos) gl.deleteVertexArray(item);
    for (const item of resources.programs) gl.deleteProgram(item);
    resources = null;
  }
  function shader(type, source) {
    const result = gl.createShader(type);
    if (!result) throw new Error('Cannot allocate WebGL shader');
    gl.shaderSource(result, source); gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(result) || 'Shader compile failed'; gl.deleteShader(result); throw new Error(message);
    }
    return result;
  }
  function program(vertex, fragment) {
    let vs = null, fs = null, result = null;
    try {
      vs = shader(gl.VERTEX_SHADER, vertex); fs = shader(gl.FRAGMENT_SHADER, fragment);
      result = gl.createProgram(); if (!result) throw new Error('Cannot allocate WebGL program');
      gl.attachShader(result, vs); gl.attachShader(result, fs); gl.linkProgram(result);
      if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result) || 'Program link failed');
      resources.programs.push(result); return result;
    } catch (error) { if (result) gl.deleteProgram(result); throw error; }
    finally { if (vs) gl.deleteShader(vs); if (fs) gl.deleteShader(fs); }
  }
  function buffer() { const result = gl.createBuffer(); if (!result) throw new Error('Cannot allocate WebGL buffer'); resources.buffers.push(result); return result; }
  function vao() { const result = gl.createVertexArray(); if (!result) throw new Error('Cannot allocate WebGL vertex array'); resources.vaos.push(result); return result; }
  function initialize() {
    resources = { buffers: [], vaos: [], programs: [], instanceCapacity: batch.capacity };
    resources.grainProgram = program(GRAIN_VERTEX, GRAIN_FRAGMENT);
    resources.frameProgram = program(FRAME_VERTEX, FRAME_FRAGMENT);
    resources.grainVao = vao(); gl.bindVertexArray(resources.grainVao);
    const mesh = buffer(); gl.bindBuffer(gl.ARRAY_BUFFER, mesh); gl.bufferData(gl.ARRAY_BUFFER, createOctagonMesh(), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    resources.instanceBuffer = buffer(); gl.bindBuffer(gl.ARRAY_BUFFER, resources.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, batch.data.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 0); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 20, 8); gl.vertexAttribDivisor(2, 1);
    resources.frameVao = vao(); gl.bindVertexArray(resources.frameVao);
    const frame = createFrameMesh(), frameBuffer = buffer(); resources.frameVertices = frame.length / 5;
    gl.bindBuffer(gl.ARRAY_BUFFER, frameBuffer); gl.bufferData(gl.ARRAY_BUFFER, frame, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 20, 8);
    gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(13 / 255, 19 / 255, 21 / 255, 1);
    antialias = gl.getContextAttributes()?.antialias ?? null;
    // A one-time initialization check, never a per-frame synchronous query.
    const error = gl.getError();
    if (error !== gl.NO_ERROR) throw new Error(`WebGL initialization error ${error}`);
    state = 'ready'; reason = '';
  }
  function contextLost(event) {
    event.preventDefault();
    if (disposed) return;
    state = 'lost'; reason = 'WebGL context lost; waiting for the browser to restore it';
    lostCount++; resources = null; notify({ recoverable: true, requiresFreshCanvas: false });
  }
  function contextRestored() {
    if (disposed) return;
    try { initialize(); restoredCount++; notify({ restored: true, recoverable: false, requiresFreshCanvas: false }); }
    catch (error) { deleteResources(); state = 'failed'; reason = `WebGL restore failed: ${error?.message || error}`; notify({ recoverable: false, requiresFreshCanvas: true }); }
  }
  canvas.addEventListener?.('webglcontextlost', contextLost);
  canvas.addEventListener?.('webglcontextrestored', contextRestored);
  try { initialize(); }
  catch (error) {
    deleteResources(); canvas.removeEventListener?.('webglcontextlost', contextLost); canvas.removeEventListener?.('webglcontextrestored', contextRestored);
    return failure(`WebGL renderer initialization failed: ${error?.message || error}`, true);
  }
  function render(snapshot, { palette = 'standard', dpr = globalThis.devicePixelRatio || 1, cssWidth } = {}) {
    if (state !== 'ready') return { ok: false, kind: 'webgl2', state, reason, recoverable: state === 'lost', requiresFreshCanvas: state === 'failed' };
    const begun = clock();
    try {
      batch.fill(snapshot, palette);
      const measuredWidth = cssWidth ?? canvas.getBoundingClientRect?.().width ?? WIDTH;
      if (!Number.isFinite(measuredWidth) || measuredWidth < 0 || !Number.isFinite(dpr) || dpr <= 0) throw new TypeError('Invalid canvas sizing');
      const width = Math.max(WIDTH, Math.round(measuredWidth * Math.min(dpr, 3))), height = Math.round(width * HEIGHT / WIDTH);
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      gl.viewport(0, 0, width, height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(resources.frameProgram); gl.bindVertexArray(resources.frameVao);
      gl.drawArrays(gl.TRIANGLES, 0, resources.frameVertices);
      if (batch.count) {
        gl.bindBuffer(gl.ARRAY_BUFFER, resources.instanceBuffer);
        if (resources.instanceCapacity < batch.capacity) {
          gl.bufferData(gl.ARRAY_BUFFER, batch.data.byteLength, gl.DYNAMIC_DRAW);
          resources.instanceCapacity = batch.capacity;
        }
        // WebGL2 offset/length form uploads exactly the live range without
        // allocating a new typed-array view. There is only one dynamic upload.
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, batch.data, 0, batch.count * INSTANCE_FLOATS);
        gl.useProgram(resources.grainProgram); gl.bindVertexArray(resources.grainVao);
        gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 10, batch.count);
      }
      const cpuSubmissionMs = clock() - begun;
      samples[sampleIndex] = cpuSubmissionMs; sampleIndex = (sampleIndex + 1) % samples.length;
      sampleCount = Math.min(samples.length, sampleCount + 1); maxSubmissionMs = Math.max(maxSubmissionMs, cpuSubmissionMs); frames++;
      last = { ok: true, kind: 'webgl2', state, physicalCount: batch.physicalCount, activeGlyphCount: batch.activeGlyphCount,
        instanceCount: batch.count, dynamicUploads: batch.count ? 1 : 0, uploadedBytes: batch.count * INSTANCE_FLOATS * 4,
        drawCalls: batch.count ? 2 : 1, cpuSubmissionMs, gpuCompletionMs: null, presentedFPS: null, width, height };
      return last;
    } catch (error) {
      // Invalid snapshots are explicit failures, never partial/subsampled output.
      // They do not poison a healthy GL context; callers may fix the next frame.
      return { ok: false, kind: 'webgl2', state, reason: String(error?.message || error), recoverable: false, requiresFreshCanvas: false };
    }
  }
  return {
    get ok() { return state === 'ready'; }, kind: 'webgl2',
    get state() { return state; }, get reason() { return reason; },
    get requiresFreshCanvas() { return state === 'failed'; },
    render,
    get diagnostics() {
      const sorted = Array.from(samples.subarray(0, sampleCount)).sort((a, b) => a - b);
      return { ...last, state, reason, frames, lostCount, restoredCount, antialias, capacity: batch.capacity,
        cpuSubmissionP95Ms: sorted.length ? sorted[Math.ceil(sorted.length * .95) - 1] : null,
        cpuSubmissionMaxMs: maxSubmissionMs, timingScope: 'CPU staging and WebGL command submission only; excludes GPU completion, compositor and display',
        p95Window: sampleCount, gpuCompletionMs: null, presentedFPS: null, pendingTasks: 0 };
    },
    dispose() {
      if (disposed) return;
      disposed = true; canvas.removeEventListener?.('webglcontextlost', contextLost); canvas.removeEventListener?.('webglcontextrestored', contextRestored);
      deleteResources(); state = 'disposed'; reason = 'Renderer disposed';
    }
  };
}
