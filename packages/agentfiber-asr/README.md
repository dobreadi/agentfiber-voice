# `@agentfiber/asr`

Provider-neutral audio capture and speech transcription contracts for AgentFiber.

This package turns an explicit capture or transcription request into audio or transcript data.
It does not match intents, grant authority, or execute product actions. Products pass final
transcripts to their grammar and retain policy and execution authority.

## Install

```sh
npm install @agentfiber/asr
```

The initial `0.1.x` package has no runtime dependencies and four explicit surfaces:

- `@agentfiber/asr`: environment-neutral contracts and result/error helpers;
- `@agentfiber/asr/browser`: browser PCM capture and WAV helpers;
- `@agentfiber/asr/http`: configurable HTTP and OpenAI-compatible Whisper clients; and
- `@agentfiber/asr/web-speech`: optional live Web Speech API adapter.

Importing the root package does not read `window`, `navigator`, audio, speech, or network globals.

## Browser PCM capture

```ts
import { startBrowserAudioCapture } from "@agentfiber/asr/browser";

const capture = await startBrowserAudioCapture(
  (peak) => updateMeter(peak),
  { targetSampleRate: 16_000, maxDurationMs: 10_000 },
);

const wav = await capture.stop();
```

Capture uses AudioWorklet when available and a ScriptProcessor compatibility fallback otherwise.
It records mono PCM at the AudioContext's native rate, resamples once on release, and returns a
self-describing 16-bit PCM WAV. `cancel()` tears down without encoding.

Browser globals are touched only when capture starts. Microphone access still requires a secure
context and product-owned permission UX.

## Configurable HTTP transcription

```ts
import { createHttpAsrTranscriber } from "@agentfiber/asr/http";

const transcriber = createHttpAsrTranscriber({
  endpoint: "/api/asr/transcribe",
  fetch,
  timeoutMs: 15_000,
});
```

The default HTTP format posts the audio bytes with their content type and parses `{text}`. Supply
`encodeRequest` and `parseResponse` for any other endpoint. Endpoint, headers, authentication,
locale, timeout, and fetch implementation are caller-owned.

For a compatible Whisper endpoint:

```ts
import { createOpenAiCompatibleWhisperTranscriber } from "@agentfiber/asr/http";

const transcriber = createOpenAiCompatibleWhisperTranscriber({
  endpoint: "https://speech.example.test/v1/audio/transcriptions",
  fetch,
  model: "whisper-large-v3-turbo",
  headers: () => ({ Authorization: `Bearer ${readShortLivedCredential()}` }),
});
```

This helper uses the common multipart `file`, `model`, optional `language`, and `{text}` contract.
It does not require or imply one provider. Never expose a server secret to a browser bundle.

## Browser or local recognition

```ts
import { createWebSpeechTranscriptSource } from "@agentfiber/asr/web-speech";

const source = createWebSpeechTranscriptSource({ interimResults: true });
const result = await source.start({
  locale: "en-GB",
  signal: controller.signal,
  onInterim: ({ text }) => showInterimText(text),
});
```

Only `completed` results are final. Interim text is observational and must not execute an action.
Web Speech availability, provider, network use, and privacy vary by browser; the adapter makes no
on-device or confidentiality claim. A local WASM, WebGPU, worker, or native implementation can
satisfy the root `AsrTranscriber` or `AsrTranscriptSource` contract without changing callers.

## Lifecycle and privacy

- Every request carries an `AbortSignal`.
- Transcribers and transcript sources expose active/disposed lifecycle.
- Results are `completed`, `rejected`, or `cancelled`.
- Empty audio, empty transcripts, timeouts, provider errors, malformed responses, and disposal
  are explicit.
- The package performs no telemetry and retains no audio, transcript, or voiceprint itself.

Products own consent, visible listening state, retention/deletion policy, rate limiting,
authentication, grammar, authority, and execution.

For observational orb or level UI, use [`@agentfiber/voice-ui`](../agentfiber-voice-ui/README.md).
For normalization, intent proposals, and dispatch contracts, use
[`@agentfiber/voice`](../agentfiber-voice/README.md).

See the [development and validation guide](../../CONTRIBUTING.md) for packed-artifact checks.
See the [voice package index](../../README.md) for related packages.
