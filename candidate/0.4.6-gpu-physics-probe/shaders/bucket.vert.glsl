#version 300 es
precision highp float;
precision highp sampler2D;
precision highp int;
uniform sampler2D uGridPosition;
uniform sampler2D uPreviousLayer;
uniform ivec2 uStateSize;
uniform ivec2 uGridSize;
uniform vec2 uGridOrigin;
uniform float uCell;
uniform int uLayer;
uniform int uCount;
flat out float vEncodedId;
void main() {
  int id = gl_VertexID;
  vec4 p = texelFetch(uGridPosition, ivec2(id % uStateSize.x, id / uStateSize.x), 0);
  gl_PointSize = 1.0;
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vEncodedId = float(id + 1);
  if (p.z < 0.5 || any(isnan(p.xy)) || any(isinf(p.xy))) return;
  ivec2 cell = ivec2(floor((p.xy - uGridOrigin) / uCell));
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
