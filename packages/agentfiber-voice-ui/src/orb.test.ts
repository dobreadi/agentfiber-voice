import { describe, expect, it } from "vitest";
import {
  ORB_ATTACK_MS,
  ORB_DECAY_MS,
  ORB_FRAGMENT_SRC,
  ORB_RMS_WINDOW,
  ORB_VERTEX_SRC,
  orbGlow,
  orbLevelTarget,
  orbRimAmp,
  orbSwirlSpeed,
  stepOrbEnvelope,
} from "./orb.js";

const FRAME_MS = 1000 / 60;

function runEnvelope(env: number, target: number, durationMs: number): number {
  let next = env;
  for (let elapsed = 0; elapsed < durationMs; elapsed += FRAME_MS) {
    next = stepOrbEnvelope(next, target, FRAME_MS);
  }
  return next;
}

describe("voice orb scalar contract", () => {
  it("attacks faster than it decays and converges without overshoot", () => {
    const rise = runEnvelope(0, 1, ORB_ATTACK_MS);
    const fall = runEnvelope(1, 0, ORB_ATTACK_MS);
    expect(rise).toBeGreaterThan(0.55);
    expect(fall).toBeGreaterThan(0.8);
    expect(runEnvelope(1, 0, ORB_DECAY_MS)).toBeGreaterThan(0.25);
    expect(runEnvelope(1, 0, ORB_DECAY_MS)).toBeLessThan(0.45);
  });

  it("normalizes invalid envelope inputs", () => {
    expect(stepOrbEnvelope(Number.NaN, 0.5, 0)).toBe(0);
    expect(stepOrbEnvelope(0.2, Number.POSITIVE_INFINITY, 16)).toBeLessThan(0.2);
    expect(stepOrbEnvelope(0.2, 1, Number.POSITIVE_INFINITY)).toBe(1);
    expect(stepOrbEnvelope(0.4, 1, -1)).toBe(0.4);
  });

  it("reads a bounded newest-level RMS without mutating its input", () => {
    const levels = new Float32Array([5, 0.6, 0.8, 1, 0.4]);
    const snapshot = levels.slice();
    expect(ORB_RMS_WINDOW).toBe(4);
    expect(orbLevelTarget(levels, levels.length)).toBeCloseTo(
      Math.sqrt((0.36 + 0.64 + 1 + 0.16) / 4),
      6,
    );
    expect(levels).toEqual(snapshot);
    expect(orbLevelTarget(levels, Number.NaN)).toBe(0);
    expect(orbLevelTarget(levels, levels.length, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("clamps level and motion edges", () => {
    const levels = new Float32Array([Number.NaN, -1, 2, Number.POSITIVE_INFINITY]);
    expect(orbLevelTarget(levels, levels.length)).toBe(0.5);
    expect(orbGlow("reactive", 99)).toBe(1);
    expect(orbRimAmp("reactive", Number.NaN)).toBe(0.05);
    expect(orbSwirlSpeed("thinking", 1)).toBe(orbSwirlSpeed("thinking", 0));
  });
});

describe("portable GLSL contract", () => {
  it("stays on WebGL1/GLES2 vocabulary", () => {
    expect(ORB_VERTEX_SRC.startsWith("precision highp float;")).toBe(true);
    expect(ORB_FRAGMENT_SRC.startsWith("precision mediump float;")).toBe(true);
    for (const source of [ORB_VERTEX_SRC, ORB_FRAGMENT_SRC]) {
      expect(source).not.toContain("#version");
      expect(source).not.toMatch(/\bin\s+vec/);
      expect(source).not.toMatch(/\bout\s+vec/);
      expect(source).not.toMatch(/\btexture\s*\(/);
    }
    expect(ORB_FRAGMENT_SRC).toContain("gl_FragColor");
  });

  it("declares the uniforms used by both renderer adapters", () => {
    for (const name of ["uPhase", "uBreath", "uHue", "uAmp", "uGlow"]) {
      expect(ORB_FRAGMENT_SRC).toContain(`uniform float ${name};`);
    }
    expect(ORB_FRAGMENT_SRC).toContain("uniform vec3 uAccent;");
    expect(ORB_FRAGMENT_SRC).toContain("uniform vec4 uColor;");
  });
});
