// Unchanged v2 position encoding excerpt from the frozen physics core.
export const POSITION_ENCODING = Object.freeze({
  name: 'cell-local-signed-code-v2',
  channels: Object.freeze(['localX', 'localY', 'signedCellCode', 'contactStrength']),
  origin: Object.freeze([28, -16]), cellSize: 4, localRange: Object.freeze([0, 4]),
  cellXBias: 128, cellYBias: 1024, cellCodeStride: 256,
  cellXRange: Object.freeze([-128, 127]), cellYRange: Object.freeze([-1024, 64511]),
  maxCodeExclusive: 16777216, invalidCode: 16777216,
  codeFormula: '(cellY + 1024) * 256 + (cellX + 128) + 1',
  alive: 'signedCellCode > 0; negative is removed; zero is padding',
  worldFormula: '(28,-16) + cell * 4 + local',
});
/** Encode a world position without first rounding the absolute coordinates to F32. */
export function encodeGPUPosition(x, y, alive = true, contactStrength = 0) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('Position requires finite x/y');
  if (!Number.isFinite(contactStrength) || contactStrength < 0 || contactStrength > 1) throw new RangeError('contactStrength must be in [0,1]');
  const e = POSITION_ENCODING;
  let cx = Math.floor((x - e.origin[0]) / e.cellSize);
  let cy = Math.floor((y - e.origin[1]) / e.cellSize);
  const codeFor = () => (cy + e.cellYBias) * e.cellCodeStride + cx + e.cellXBias + 1;
  const checkRange = () => {
    const code = codeFor();
    if (!Number.isSafeInteger(cx) || !Number.isSafeInteger(cy) || cx < -128 || cx > 127 || cy < -1024 || cy > 64511 || code < 1 || code >= e.maxCodeExclusive) {
      throw new RangeError('Position is outside the exact cell-code packing range (code must be < 2^24)');
    }
    return code;
  };
  checkRange();
  let lx = Math.fround(x - e.origin[0] - cx * e.cellSize);
  let ly = Math.fround(y - e.origin[1] - cy * e.cellSize);
  // Rounding a remainder immediately below 4 can carry into the next cell.
  if (lx >= e.cellSize) { lx = 0; cx++; }
  if (ly >= e.cellSize) { ly = 0; cy++; }
  const code = checkRange();
  return new Float32Array([lx, ly, alive ? code : -code, contactStrength]);
}

/** Decode RGBA32F positions in JS double precision; never round world coordinates to F32. */
export function decodeGPUPositions(encoded) {
  if (!encoded || encoded.length % 4 !== 0) throw new TypeError('Encoded position data must contain RGBA tuples');
  const decoded = new Float64Array(encoded.length), e = POSITION_ENCODING;
  for (let at = 0; at < encoded.length; at += 4) {
    const code = Math.abs(encoded[at + 2]);
    if (code === 0) continue; // Preserve zero padding as a zero tuple.
    const valid = Number.isInteger(code) && code >= 1 && code < e.maxCodeExclusive;
    const packed = code - 1;
    decoded[at] = valid ? e.origin[0] + (packed % e.cellCodeStride - e.cellXBias) * e.cellSize + encoded[at] : NaN;
    decoded[at + 1] = valid ? e.origin[1] + (Math.floor(packed / e.cellCodeStride) - e.cellYBias) * e.cellSize + encoded[at + 1] : NaN;
    decoded[at + 2] = encoded[at + 2] > 0 ? 1 : 0;
    decoded[at + 3] = encoded[at + 3];
  }
  return decoded;
}

