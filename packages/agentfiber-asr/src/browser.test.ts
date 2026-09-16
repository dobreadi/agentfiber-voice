import { describe, expect, it } from "vitest";
import {
  chunkPeak,
  concatPcmChunks,
  encodePcm16Wav,
  openBrowserPcmTap,
  resamplePcmLinear,
  startBrowserAudioCapture,
  supportsBrowserPcmCapture,
} from "./browser.js";

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let value = "";
  for (let i = 0; i < length; i++) value += String.fromCharCode(bytes[offset + i] as number);
  return value;
}

describe("browser PCM helpers", () => {
  it("keeps the root-compatible module import safe without browser capture globals", () => {
    expect(supportsBrowserPcmCapture()).toBe(false);
  });

  it("rejects invalid cold-path limits before microphone access", async () => {
    await expect(
      startBrowserAudioCapture(() => undefined, { maxDurationMs: Number.NaN }),
    ).rejects.toThrow(/maxDurationMs must be a positive finite number/);
    await expect(
      startBrowserAudioCapture(() => undefined, { targetSampleRate: 0 }),
    ).rejects.toThrow(/targetSampleRate must be a positive finite number/);
  });

  it("honors an already-aborted arming signal before browser access", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      openBrowserPcmTap(() => undefined, { signal: controller.signal }),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("finds an allocation-free absolute chunk peak", () => {
    expect(chunkPeak(new Float32Array([0.1, -0.8, 0.3]))).toBeCloseTo(0.8);
    expect(chunkPeak(new Float32Array(0))).toBe(0);
  });

  it("joins chunks and truncates at the declared total", () => {
    expect(
      Array.from(concatPcmChunks([new Float32Array([1, 2]), new Float32Array([3, 4])], 3)),
    ).toEqual([1, 2, 3]);
  });

  it("rejects invalid totals", () => {
    expect(() => concatPcmChunks([], -1)).toThrow(/non-negative safe integer/);
    expect(() => concatPcmChunks([], Number.NaN)).toThrow(/non-negative safe integer/);
  });

  it("resamples once while preserving endpoints", () => {
    const source = new Float32Array([0, 1, 2, 3]);
    const result = resamplePcmLinear(source, 4, 2);
    expect(result.length).toBe(2);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(3);
    expect(resamplePcmLinear(source, 16_000, 16_000)).toBe(source);
  });

  it("rejects invalid sample rates", () => {
    for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => resamplePcmLinear(new Float32Array([0]), invalid, 16_000)).toThrow(
        /positive finite/,
      );
      expect(() => encodePcm16Wav(new Float32Array([0]), invalid)).toThrow(/positive finite/);
    }
  });

  it("encodes a valid mono PCM WAV and sanitizes non-finite samples", () => {
    const wav = encodePcm16Wav(
      new Float32Array([0, 0.5, -0.5, 1, -1, Number.NaN, Number.POSITIVE_INFINITY]),
      16_000,
    );
    const view = new DataView(wav.buffer, wav.byteOffset);
    expect(ascii(wav, 0, 4)).toBe("RIFF");
    expect(ascii(wav, 8, 4)).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getInt16(54, true)).toBe(0);
    expect(view.getInt16(56, true)).toBe(0);
  });
});
