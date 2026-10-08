#version 300 es
precision highp float;
precision highp sampler2D;
precision highp int;
uniform sampler2D uPosition;
uniform sampler2D uVelocity;
uniform float uDt;
uniform float uGravity;
uniform float uVyCap;
layout(location=0) out vec4 outGridPosition;
layout(location=1) out vec4 outPrevious;
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  vec4 p = texelFetch(uPosition, at, 0);
  vec4 v = texelFetch(uVelocity, at, 0);
  outPrevious = p;
  if (p.z < 0.5) { outGridPosition = vec4(p.xy, 0.0, 0.0); return; }
  vec2 velocity = vec2(v.x, min(uVyCap, v.y + uGravity * uDt));
  outGridPosition = vec4(p.xy + velocity * uDt, p.z, 0.0);
}
