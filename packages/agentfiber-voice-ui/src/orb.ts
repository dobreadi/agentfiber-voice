/** Framework-free scalar motion and WebGL1 shader contract for a voice-reactive orb. */

export const ORB_QUAD_SIZE = 280;
export const ORB_ATTACK_MS = 50;
export const ORB_DECAY_MS = 300;
export const ORB_RMS_WINDOW = 4;
export const ORB_BREATH_SPEED = 0.9;
export const ORB_HUE_SPEED = 0.12;

export type OrbMode = "reactive" | "thinking" | "breathe";

function finiteLevel(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

export function orbLevelTarget(
  levels: Float32Array,
  count: number,
  windowSize = ORB_RMS_WINDOW,
): number {
  if (!Number.isFinite(count) || !Number.isFinite(windowSize) || windowSize <= 0) return 0;
  const end = Math.min(levels.length, Math.max(0, Math.floor(count)));
  const start = Math.max(0, end - Math.floor(windowSize));
  let sum = 0;
  let samples = 0;
  for (let i = start; i < end; i++) {
    const level = finiteLevel(levels[i] as number);
    sum += level * level;
    samples++;
  }
  return samples === 0 ? 0 : Math.sqrt(sum / samples);
}

export function stepOrbEnvelope(env: number, target: number, dtMs: number): number {
  const safeEnv = finiteLevel(env);
  const safeTarget = finiteLevel(target);
  if (dtMs <= 0 || Number.isNaN(dtMs)) return safeEnv;
  if (!Number.isFinite(dtMs)) return safeTarget;
  const tau = safeTarget > safeEnv ? ORB_ATTACK_MS : ORB_DECAY_MS;
  const factor = 1 - Math.exp(-dtMs / tau);
  return safeEnv + (safeTarget - safeEnv) * factor;
}

export function orbSwirlSpeed(mode: OrbMode, env: number): number {
  if (mode === "reactive") return 0.3 + 2.1 * finiteLevel(env);
  if (mode === "thinking") return 0.55;
  return 0.3;
}

export function orbRimAmp(mode: OrbMode, env: number): number {
  if (mode === "reactive") return 0.05 + 0.3 * finiteLevel(env);
  if (mode === "thinking") return 0.035;
  return 0.06;
}

export function orbGlow(mode: OrbMode, env: number): number {
  if (mode === "reactive") return Math.min(1, finiteLevel(env) * 1.5);
  if (mode === "thinking") return 0.3;
  return 0.18;
}

export const ORB_VERTEX_SRC = `precision highp float;

attribute vec2 aPosition;
attribute vec2 aUV;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

varying vec2 vUV;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}
`;

export const ORB_FRAGMENT_SRC = `precision mediump float;

varying vec2 vUV;

uniform float uPhase;
uniform float uBreath;
uniform float uHue;
uniform float uAmp;
uniform float uGlow;
uniform vec3 uAccent;
uniform vec4 uColor;

float orbHash(vec2 p) {
  vec3 q = fract(vec3(p.x, p.y, p.x) * 0.1031);
  q += dot(q, vec3(q.y, q.z, q.x) + 33.33);
  return fract((q.x + q.y) * q.z);
}

float orbNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = orbHash(i);
  float b = orbHash(i + vec2(1.0, 0.0));
  float c = orbHash(i + vec2(0.0, 1.0));
  float d = orbHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float orbFbm(vec2 p) {
  float s = 0.5 * orbNoise(p);
  p = p * 2.03 + vec2(7.3, 3.1);
  s += 0.25 * orbNoise(p);
  p = p * 1.97 + vec2(1.7, 9.2);
  s += 0.125 * orbNoise(p);
  return s * 1.142857;
}

void main() {
  vec2 p = vUV * 2.0 - 1.0;
  float r = length(p);
  vec2 dir = r > 0.0001 ? p / r : vec2(1.0, 0.0);
  vec2 drift = vec2(cos(uPhase), sin(uPhase));
  float n = orbFbm(dir * 2.6 + drift * 1.3 + vec2(cos(uPhase * 2.0), sin(uBreath)) * 0.35);
  float radius = 0.58 + 0.04 * sin(uBreath) + (n - 0.5) * uAmp;
  float d = r - radius;
  float body = 1.0 - smoothstep(-0.02, 0.02, d);
  float inner = orbFbm(p * 2.2 - drift * 0.9 + vec2(sin(uBreath * 2.0), cos(uBreath)) * 0.2);
  float core = 1.0 - smoothstep(0.0, radius, r);
  core *= core;
  vec3 tint = uAccent * (0.85 + 0.3 * vec3(
    0.5 + 0.5 * cos(uHue),
    0.5 + 0.5 * cos(uHue + 2.1),
    0.5 + 0.5 * cos(uHue + 4.2)));
  vec3 col = tint * (0.5 + 0.5 * inner) * body;
  col += tint * core * (0.7 + 0.9 * uGlow);
  float halo = exp(-abs(d) * 9.0) * (0.35 + 0.65 * uGlow);
  col += tint * halo;
  float alpha = body + halo * 0.8;
  if (alpha > 1.0) alpha = 1.0;
  gl_FragColor = vec4(col, alpha) * uColor;
}
`;
