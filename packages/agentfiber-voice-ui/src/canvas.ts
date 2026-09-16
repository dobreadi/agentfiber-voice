import {
  ORB_BREATH_SPEED,
  ORB_FRAGMENT_SRC,
  ORB_HUE_SPEED,
  ORB_RMS_WINDOW,
  type OrbMode,
  orbGlow,
  orbLevelTarget,
  orbRimAmp,
  orbSwirlSpeed,
  stepOrbEnvelope,
} from "./orb.js";

const CANVAS_VERTEX_SRC = `precision highp float;

attribute vec2 aPosition;

varying vec2 vUV;

void main() {
  vUV = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const DEFAULT_ACCENT: readonly [number, number, number] = [0xe8 / 255, 0xa8 / 255, 0x6a / 255];
const TWO_PI = Math.PI * 2;

export interface VoiceOrbCanvasOptions {
  /** Normalized RGB components. Defaults to the reference warm accent. */
  accent?: readonly [number, number, number];
  /** Caps backing-store density without changing the canvas's CSS size. */
  maxDevicePixelRatio?: number;
  /** Cadence used to fold chunk peaks into the short RMS window. */
  levelTickMs?: number;
  /** Holds a calm, non-reactive orb when motion should be reduced. */
  reducedMotion?: boolean;
  /** Receives shader compilation/link failures. Defaults to console.error. */
  onError?: (message: string) => void;
}

export interface VoiceOrbCanvasHandle {
  /** `off` parks all timers and animation work. */
  setMode(mode: OrbMode | "off"): void;
  /** Push a single normalized capture level. Allocation-free hot path. */
  setLevel(level: number): void;
  /** Compatibility alias for capture adapters that report chunk peaks. */
  onChunkLevel(level: number): void;
  destroy(): void;
}

function finiteUnit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

function finitePositive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
  onError: (message: string) => void,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (shader === null) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  onError(gl.getShaderInfoLog(shader) ?? "Voice orb shader compilation failed");
  gl.deleteShader(shader);
  return null;
}

/**
 * Mount the reusable orb on a plain canvas. Browser globals are read only when
 * this function is called; importing the module is safe in SSR and Node.
 */
export function mountVoiceOrb(
  canvas: HTMLCanvasElement,
  options: VoiceOrbCanvasOptions = {},
): VoiceOrbCanvasHandle | null {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
  });
  if (gl === null) return null;

  const reportError =
    options.onError ??
    ((message: string): void => console.error("[agentfiber_voice_orb]", message));
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, CANVAS_VERTEX_SRC, reportError);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, ORB_FRAGMENT_SRC, reportError);
  const program = gl.createProgram();
  if (vertexShader === null || fragmentShader === null || program === null) {
    if (vertexShader !== null) gl.deleteShader(vertexShader);
    if (fragmentShader !== null) gl.deleteShader(fragmentShader);
    if (program !== null) gl.deleteProgram(program);
    return null;
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    reportError(gl.getProgramInfoLog(program) ?? "Voice orb program link failed");
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }
  gl.useProgram(program);

  const quad = gl.createBuffer();
  const aPosition = gl.getAttribLocation(program, "aPosition");
  if (quad === null || aPosition < 0) {
    if (quad !== null) gl.deleteBuffer(quad);
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

  const uPhase = gl.getUniformLocation(program, "uPhase");
  const uBreath = gl.getUniformLocation(program, "uBreath");
  const uHue = gl.getUniformLocation(program, "uHue");
  const uAmp = gl.getUniformLocation(program, "uAmp");
  const uGlow = gl.getUniformLocation(program, "uGlow");
  const accent = options.accent ?? DEFAULT_ACCENT;
  gl.uniform3f(
    gl.getUniformLocation(program, "uAccent"),
    finiteUnit(accent[0]),
    finiteUnit(accent[1]),
    finiteUnit(accent[2]),
  );
  gl.uniform4f(gl.getUniformLocation(program, "uColor"), 1, 1, 1, 1);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  const ownerDocument = canvas.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  if (ownerWindow === null) {
    gl.deleteBuffer(quad);
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }
  const renderWindow = ownerWindow;
  const renderContext = gl;

  const maxDpr = finitePositive(options.maxDevicePixelRatio, 2);
  const levelTickMs = finitePositive(options.levelTickMs, 100);
  const reducedMotion = options.reducedMotion === true;
  const levels = new Float32Array(ORB_RMS_WINDOW);
  let pendingPeak = 0;
  let mode: OrbMode | "off" = "off";
  let env = 0;
  let phase = 0;
  let breath = 0;
  let hue = 0;
  let lastTimestamp = 0;
  let animationFrame = 0;
  let levelTimer: ReturnType<typeof setInterval> | undefined;
  let destroyed = false;

  function onLevelTick(): void {
    levels.copyWithin(0, 1);
    levels[ORB_RMS_WINDOW - 1] = pendingPeak;
    pendingPeak = 0;
  }

  function resize(): void {
    const dpr = Math.min(maxDpr, finitePositive(renderWindow.devicePixelRatio, 1));
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    renderContext.viewport(0, 0, width, height);
  }

  function frame(timestamp: number): void {
    if (mode === "off" || destroyed) {
      animationFrame = 0;
      return;
    }
    animationFrame = reducedMotion ? 0 : renderWindow.requestAnimationFrame(frame);
    const dtMs = lastTimestamp === 0 ? 16.7 : Math.min(100, Math.max(0, timestamp - lastTimestamp));
    lastTimestamp = timestamp;

    const renderMode = reducedMotion ? "breathe" : mode;
    const target = renderMode === "reactive" ? orbLevelTarget(levels, ORB_RMS_WINDOW) : 0;
    env = stepOrbEnvelope(env, target, dtMs);
    const dtSeconds = dtMs * 0.001;
    phase = (phase + orbSwirlSpeed(renderMode, env) * dtSeconds) % TWO_PI;
    breath = (breath + ORB_BREATH_SPEED * dtSeconds) % TWO_PI;
    hue = (hue + ORB_HUE_SPEED * dtSeconds) % TWO_PI;

    resize();
    renderContext.clear(renderContext.COLOR_BUFFER_BIT);
    renderContext.uniform1f(uPhase, phase);
    renderContext.uniform1f(uBreath, breath);
    renderContext.uniform1f(uHue, hue);
    renderContext.uniform1f(uAmp, orbRimAmp(renderMode, env));
    renderContext.uniform1f(uGlow, orbGlow(renderMode, env));
    renderContext.drawArrays(renderContext.TRIANGLES, 0, 6);
  }

  function ensureLoop(): void {
    if (
      animationFrame === 0 &&
      mode !== "off" &&
      !destroyed &&
      ownerDocument.visibilityState === "visible"
    ) {
      lastTimestamp = 0;
      animationFrame = renderWindow.requestAnimationFrame(frame);
    }
  }

  function setMode(nextMode: OrbMode | "off"): void {
    if (destroyed) return;
    mode = nextMode;
    if (nextMode === "off") {
      if (animationFrame !== 0) renderWindow.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      if (levelTimer !== undefined) clearInterval(levelTimer);
      levelTimer = undefined;
      levels.fill(0);
      pendingPeak = 0;
      env = 0;
      return;
    }
    levelTimer ??= setInterval(onLevelTick, levelTickMs);
    ensureLoop();
  }

  function setLevel(level: number): void {
    const normalized = finiteUnit(level);
    if (normalized > pendingPeak) pendingPeak = normalized;
  }

  function onVisibilityChange(): void {
    if (ownerDocument.visibilityState !== "visible" && animationFrame !== 0) {
      renderWindow.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    } else {
      ensureLoop();
    }
  }
  ownerDocument.addEventListener("visibilitychange", onVisibilityChange);

  return {
    setMode,
    setLevel,
    onChunkLevel: setLevel,
    destroy(): void {
      if (destroyed) return;
      setMode("off");
      destroyed = true;
      ownerDocument.removeEventListener("visibilitychange", onVisibilityChange);
      gl.deleteBuffer(quad);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
