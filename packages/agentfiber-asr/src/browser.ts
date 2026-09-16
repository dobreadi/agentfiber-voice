/** Product-neutral browser PCM capture. Browser globals are touched only after an explicit call. */

export const DEFAULT_ASR_TARGET_SAMPLE_RATE = 16_000;
export const DEFAULT_ASR_MAX_DURATION_MS = 10_000;

export interface BrowserPcmTap {
  readonly sampleRate: number;
  close(): void;
}

export interface BrowserAudioCapture {
  stop(): Promise<Uint8Array>;
  cancel(): void;
}

export interface BrowserPcmTapOptions {
  readonly audio?: MediaTrackConstraints;
  readonly signal?: AbortSignal;
}

export interface BrowserAudioCaptureOptions extends BrowserPcmTapOptions {
  readonly targetSampleRate?: number;
  readonly maxDurationMs?: number;
}

const DEFAULT_AUDIO_CONSTRAINTS: MediaTrackConstraints = Object.freeze({
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
});

const WORKLET_SOURCE = `
class AgentFiberPcmTap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length > 0) {
      const copy = new Float32Array(ch.length);
      copy.set(ch);
      this.port.postMessage(copy, [copy.buffer]);
    }
    return true;
  }
}
registerProcessor("agentfiber-pcm-tap", AgentFiberPcmTap);
`;

function positiveFinite(name: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
  return value;
}

function signalAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

export function supportsBrowserPcmCapture(): boolean {
  const scope = globalThis as typeof globalThis & {
    navigator?: Navigator;
    AudioContext?: typeof AudioContext;
  };
  return (
    typeof scope.navigator?.mediaDevices?.getUserMedia === "function" &&
    typeof scope.AudioContext === "function"
  );
}

export async function openBrowserPcmTap(
  onChunk: (chunk: Float32Array) => void,
  options: BrowserPcmTapOptions = {},
): Promise<BrowserPcmTap> {
  if (signalAborted(options.signal)) {
    throw new DOMException("browser PCM capture was aborted before arming", "AbortError");
  }
  if (!supportsBrowserPcmCapture()) {
    throw new Error("browser PCM capture is unsupported");
  }

  const scope = globalThis as typeof globalThis & {
    navigator: Navigator;
    AudioContext: typeof AudioContext;
    AudioWorkletNode?: typeof AudioWorkletNode;
  };
  const stream = await scope.navigator.mediaDevices.getUserMedia({
    audio: options.audio ?? DEFAULT_AUDIO_CONSTRAINTS,
  });
  if (signalAborted(options.signal)) {
    const tracks = stream.getTracks();
    for (let i = 0, len = tracks.length; i < len; i++) tracks[i]?.stop();
    throw new DOMException("browser PCM capture was aborted while arming", "AbortError");
  }
  const ctx = new scope.AudioContext();
  if (ctx.state === "suspended") void ctx.resume();

  let stopped = false;
  let source: MediaStreamAudioSourceNode | null = null;
  let sink: GainNode | null = null;
  let tapNode: AudioNode | null = null;
  let workletUrl: string | null = null;
  const onAbort = (): void => close();

  const close = (): void => {
    if (stopped) return;
    stopped = true;
    source?.disconnect();
    tapNode?.disconnect();
    sink?.disconnect();
    const tracks = stream.getTracks();
    for (let i = 0, len = tracks.length; i < len; i++) tracks[i]?.stop();
    if (workletUrl !== null) URL.revokeObjectURL(workletUrl);
    options.signal?.removeEventListener("abort", onAbort);
    void ctx.close();
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const deliver = (chunk: Float32Array): void => {
      if (!stopped) onChunk(chunk);
    };
    source = ctx.createMediaStreamSource(stream);
    sink = ctx.createGain();
    sink.gain.value = 0;

    if (
      typeof ctx.audioWorklet?.addModule === "function" &&
      typeof scope.AudioWorkletNode === "function"
    ) {
      workletUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "text/javascript" }));
      await ctx.audioWorklet.addModule(workletUrl);
      const worklet = new scope.AudioWorkletNode(ctx, "agentfiber-pcm-tap", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
      });
      worklet.port.onmessage = (event: MessageEvent<Float32Array>) => deliver(event.data);
      tapNode = worklet;
    } else {
      const processor = ctx.createScriptProcessor(2048, 1, 1);
      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input.length);
        copy.set(input);
        deliver(copy);
      };
      tapNode = processor;
    }

    source.connect(tapNode);
    tapNode.connect(sink);
    sink.connect(ctx.destination);

    return Object.freeze({ sampleRate: ctx.sampleRate, close });
  } catch (error) {
    close();
    throw error;
  }
}

export async function startBrowserAudioCapture(
  onLevel: (peak: number) => void,
  options: BrowserAudioCaptureOptions = {},
): Promise<BrowserAudioCapture> {
  const targetSampleRate = positiveFinite(
    "targetSampleRate",
    options.targetSampleRate ?? DEFAULT_ASR_TARGET_SAMPLE_RATE,
  );
  const maxDurationMs = positiveFinite(
    "maxDurationMs",
    options.maxDurationMs ?? DEFAULT_ASR_MAX_DURATION_MS,
  );
  const chunks: Float32Array[] = [];
  let totalSamples = 0;
  let maxSamples = Number.POSITIVE_INFINITY;
  let finished = false;
  let aborted = signalAborted(options.signal);

  const tap = await openBrowserPcmTap((chunk) => {
    if (finished || totalSamples >= maxSamples) return;
    const room = maxSamples - totalSamples;
    const kept = chunk.length <= room ? chunk : chunk.subarray(0, room);
    chunks.push(kept);
    totalSamples += kept.length;
    onLevel(chunkPeak(kept));
  }, options);
  if (signalAborted(options.signal)) {
    tap.close();
    chunks.length = 0;
    throw new DOMException("browser audio capture was aborted while arming", "AbortError");
  }
  const sourceRate = positiveFinite("sourceSampleRate", tap.sampleRate);
  maxSamples = Math.ceil((sourceRate * maxDurationMs) / 1000);
  const onAbort = (): void => {
    if (finished) return;
    aborted = true;
    finished = true;
    tap.close();
    chunks.length = 0;
    totalSamples = 0;
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });

  return {
    async stop(): Promise<Uint8Array> {
      if (aborted) throw new DOMException("browser audio capture was aborted", "AbortError");
      if (finished) throw new Error("browser audio capture is already finished");
      finished = true;
      options.signal?.removeEventListener("abort", onAbort);
      tap.close();
      const pcm = concatPcmChunks(chunks, totalSamples);
      const resampled =
        sourceRate === targetSampleRate
          ? pcm
          : resamplePcmLinear(pcm, sourceRate, targetSampleRate);
      chunks.length = 0;
      return encodePcm16Wav(resampled, targetSampleRate);
    },
    cancel(): void {
      if (finished) return;
      finished = true;
      options.signal?.removeEventListener("abort", onAbort);
      tap.close();
      chunks.length = 0;
      totalSamples = 0;
    },
  };
}

/** Peak absolute sample value. Indexed and allocation-free. */
export function chunkPeak(chunk: Float32Array): number {
  let peak = 0;
  for (let i = 0, len = chunk.length; i < len; i++) {
    const value = chunk[i] as number;
    const absolute = value < 0 ? -value : value;
    if (absolute > peak) peak = absolute;
  }
  return peak;
}

export function concatPcmChunks(
  chunks: readonly Float32Array[],
  totalSamples: number,
): Float32Array {
  if (!Number.isSafeInteger(totalSamples) || totalSamples < 0) {
    throw new RangeError("totalSamples must be a non-negative safe integer");
  }
  const output = new Float32Array(totalSamples);
  let offset = 0;
  for (let i = 0, len = chunks.length; i < len; i++) {
    const chunk = chunks[i] as Float32Array;
    const room = totalSamples - offset;
    if (room <= 0) break;
    output.set(room >= chunk.length ? chunk : chunk.subarray(0, room), offset);
    offset += room >= chunk.length ? chunk.length : room;
  }
  return output;
}

export function resamplePcmLinear(
  source: Float32Array,
  fromSampleRate: number,
  toSampleRate: number,
): Float32Array {
  positiveFinite("fromSampleRate", fromSampleRate);
  positiveFinite("toSampleRate", toSampleRate);
  if (fromSampleRate === toSampleRate || source.length === 0) return source;
  const outputLength = Math.max(1, Math.round((source.length * toSampleRate) / fromSampleRate));
  const output = new Float32Array(outputLength);
  const step = (source.length - 1) / Math.max(1, outputLength - 1);
  for (let i = 0; i < outputLength; i++) {
    const position = i * step;
    const lower = Math.floor(position);
    const upper = lower + 1 < source.length ? lower + 1 : lower;
    const fraction = position - lower;
    output[i] = (source[lower] as number) * (1 - fraction) + (source[upper] as number) * fraction;
  }
  return output;
}

export function encodePcm16Wav(samples: Float32Array, sampleRate: number): Uint8Array {
  positiveFinite("sampleRate", sampleRate);
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0, len = samples.length; i < len; i++) {
    let sample = samples[i] as number;
    if (!Number.isFinite(sample)) sample = 0;
    else if (sample > 1) sample = 1;
    else if (sample < -1) sample = -1;
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0, len = text.length; i < len; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
