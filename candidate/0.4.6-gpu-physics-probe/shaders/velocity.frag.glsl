#version 300 es
precision highp float;
precision highp sampler2D;
precision highp int;
uniform sampler2D uPosition;
uniform sampler2D uPrevious;
uniform float uDt;
uniform float uContactDamping;
uniform float uFloorFriction;
uniform float uFloor;
uniform float uRadius;
layout(location=0) out vec4 outVelocity;
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  vec4 p = texelFetch(uPosition, at, 0);
  vec4 old = texelFetch(uPrevious, at, 0);
  if (p.z < 0.5) { outVelocity = vec4(0.0); return; }
  vec2 v = (p.xy - old.xy) / uDt;
  if (p.w > 0.5) v *= uContactDamping;
  if (p.y >= uFloor - uRadius - 1e-6) v.x *= uFloorFriction;
  // Sleep is intentionally disabled in this first prototype.
  outVelocity = vec4(v, 0.0, 0.0);
}
