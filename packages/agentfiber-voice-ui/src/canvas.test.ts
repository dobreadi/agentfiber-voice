import { describe, expect, it, vi } from "vitest";
import { mountVoiceOrb } from "./canvas.js";

describe("mountVoiceOrb", () => {
  it("fails closed when WebGL is unavailable", () => {
    const getContext = vi.fn(() => null);
    const canvas = { getContext } as unknown as HTMLCanvasElement;
    expect(mountVoiceOrb(canvas)).toBeNull();
    expect(getContext).toHaveBeenCalledWith("webgl", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
    });
  });

  it("reports compilation failures without throwing", () => {
    const onError = vi.fn();
    const gl = {
      VERTEX_SHADER: 1,
      FRAGMENT_SHADER: 2,
      COMPILE_STATUS: 3,
      createShader: vi.fn(() => ({})),
      shaderSource: vi.fn(),
      compileShader: vi.fn(),
      getShaderParameter: vi.fn(() => false),
      getShaderInfoLog: vi.fn(() => "unsupported shader"),
      deleteShader: vi.fn(),
      createProgram: vi.fn(() => ({})),
      deleteProgram: vi.fn(),
    };
    const canvas = { getContext: vi.fn(() => gl) } as unknown as HTMLCanvasElement;
    expect(mountVoiceOrb(canvas, { onError })).toBeNull();
    expect(onError).toHaveBeenCalledWith("unsupported shader");
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
  });

  it("parks work and releases resources idempotently", () => {
    let scheduledFrame: FrameRequestCallback | undefined;
    const loseContext = vi.fn();
    const gl = {
      VERTEX_SHADER: 1,
      FRAGMENT_SHADER: 2,
      COMPILE_STATUS: 3,
      LINK_STATUS: 4,
      ARRAY_BUFFER: 5,
      STATIC_DRAW: 6,
      FLOAT: 7,
      BLEND: 8,
      ONE: 9,
      ONE_MINUS_SRC_ALPHA: 10,
      COLOR_BUFFER_BIT: 11,
      TRIANGLES: 12,
      createShader: vi.fn(() => ({})),
      shaderSource: vi.fn(),
      compileShader: vi.fn(),
      getShaderParameter: vi.fn(() => true),
      getShaderInfoLog: vi.fn(),
      deleteShader: vi.fn(),
      createProgram: vi.fn(() => ({})),
      attachShader: vi.fn(),
      linkProgram: vi.fn(),
      getProgramParameter: vi.fn(() => true),
      getProgramInfoLog: vi.fn(),
      useProgram: vi.fn(),
      deleteProgram: vi.fn(),
      createBuffer: vi.fn(() => ({})),
      bindBuffer: vi.fn(),
      bufferData: vi.fn(),
      getAttribLocation: vi.fn(() => 0),
      enableVertexAttribArray: vi.fn(),
      vertexAttribPointer: vi.fn(),
      getUniformLocation: vi.fn(() => ({})),
      uniform3f: vi.fn(),
      uniform4f: vi.fn(),
      enable: vi.fn(),
      blendFunc: vi.fn(),
      clearColor: vi.fn(),
      viewport: vi.fn(),
      clear: vi.fn(),
      uniform1f: vi.fn(),
      drawArrays: vi.fn(),
      deleteBuffer: vi.fn(),
      getExtension: vi.fn(() => ({ loseContext })),
    };
    const ownerWindow = {
      devicePixelRatio: 3,
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        scheduledFrame = callback;
        return 42;
      }),
      cancelAnimationFrame: vi.fn(),
    };
    const ownerDocument = {
      defaultView: ownerWindow,
      visibilityState: "visible",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    const canvas = {
      getContext: vi.fn(() => gl),
      ownerDocument,
      clientWidth: 100,
      clientHeight: 50,
      width: 0,
      height: 0,
    } as unknown as HTMLCanvasElement;

    const handle = mountVoiceOrb(canvas, { maxDevicePixelRatio: 2 });
    expect(handle).not.toBeNull();
    handle?.setMode("reactive");
    handle?.setLevel(Number.POSITIVE_INFINITY);
    scheduledFrame?.(16.7);
    expect(gl.viewport).toHaveBeenCalledWith(0, 0, 200, 100);
    expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 6);

    handle?.setMode("off");
    handle?.destroy();
    handle?.destroy();
    expect(ownerWindow.cancelAnimationFrame).toHaveBeenCalled();
    expect(ownerDocument.removeEventListener).toHaveBeenCalledTimes(1);
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(1);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });
});
