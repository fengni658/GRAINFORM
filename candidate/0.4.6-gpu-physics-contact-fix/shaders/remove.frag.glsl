#version 300 es
precision highp float;
precision highp sampler2D;
precision highp int;
uniform sampler2D uPosition;
uniform sampler2D uVelocity;
uniform sampler2D uRemoveMask;
layout(location=0) out vec4 outPosition;
layout(location=1) out vec4 outVelocity;
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  vec4 p = texelFetch(uPosition, at, 0);
  vec4 v = texelFetch(uVelocity, at, 0);
  bool remove = texelFetch(uRemoveMask, at, 0).x > 0.5;
  outPosition = remove ? vec4(p.xy, -abs(p.z), p.w) : p;
  outVelocity = v; // Removal changes only the code sign; survivors and stored velocities are untouched.
}
