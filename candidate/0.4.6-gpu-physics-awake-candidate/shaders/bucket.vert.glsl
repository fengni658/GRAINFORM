#version 300 es
precision highp float;
precision highp sampler2D;
precision highp int;
uniform sampler2D uGridPosition;
uniform sampler2D uPreviousLayer;
uniform ivec2 uStateSize;
uniform ivec2 uGridSize;
uniform int uLayer;
uniform int uCount;
flat out float vEncodedId;
// RGBA = local x/y in [0,4), signed exact cell code, contact strength.
// Positive code is alive; negative code retains a removed particle; zero is padding.
// 2^24 is reserved for a runtime packing failure, never an aliased cell.
const float INVALID_CELL_CODE = 16777216.0;
bool validCellCode(float code) {
  return !isnan(code) && !isinf(code) && abs(code) >= 1.0 && abs(code) < INVALID_CELL_CODE && floor(abs(code)) == abs(code);
}
ivec2 positionCell(vec4 p) {
  int cellIndex = int(abs(p.z)) - 1;
  return ivec2(cellIndex % 256 - 128, cellIndex / 256 - 1024);
}
vec2 positionDifference(vec4 a, vec4 b) {
  return (a.xy - b.xy) + vec2(positionCell(a) - positionCell(b)) * 4.0;
}
void main() {
  int id = gl_VertexID;
  vec4 p = texelFetch(uGridPosition, ivec2(id % uStateSize.x, id / uStateSize.x), 0);
  gl_PointSize = 1.0;
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vEncodedId = float(id + 1);
  if (p.z <= 0.0 || !validCellCode(p.z) || any(isnan(p.xy)) || any(isinf(p.xy))) return;
  ivec2 cell = positionCell(p);
  if (any(lessThan(cell, ivec2(0))) || any(greaterThanEqual(cell, uGridSize))) return;
  if (uLayer > 0) {
    ivec2 previousAt = cell + ivec2(0, ((uLayer - 1) / 2) * uGridSize.y);
    float previousId = texelFetch(uPreviousLayer, previousAt, 0).x;
    if (previousId < 0.5 || vEncodedId <= previousId) return;
  }
  vec2 ndc = (vec2(cell) + 0.5) / vec2(uGridSize) * 2.0 - 1.0;
  float depth = float(id + 1) / float(uCount + 1);
  gl_Position = vec4(ndc, depth * 2.0 - 1.0, 1.0);
}
