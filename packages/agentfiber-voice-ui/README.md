# `@agentfiber/voice-ui`

Portable, policy-free voice capture visualisation for AgentFiber products. The package provides a
liquid orb as renderer-neutral math and GLSL, a raw WebGL canvas controller, and an
optional React layer with both canvas and DOM/SVG choices.

It does **not** capture audio, transcribe speech, parse intents, choose actions, or map product
statuses. Those decisions belong to the ASR adapter and product host.

## Install

```sh
npm install @agentfiber/voice-ui
```

Install React only when using the React entry point:

```sh
npm install @agentfiber/voice-ui react
```

## Choose an entry point

- `@agentfiber/voice-ui` — pure modes, scalar envelope/math helpers, and WebGL1/GLES2 shader
  sources. Use this for a custom renderer such as Pixi.
- `@agentfiber/voice-ui/canvas` — a raw `<canvas>` WebGL controller. It has no framework runtime
  dependency and fails closed with `null` when WebGL is unavailable.
- `@agentfiber/voice-ui/react` — `VoiceOrbCanvas` plus `VoiceLevelBars`, a bounded SVG fallback that
  has no animation loop.

## Canvas

```ts
import { mountVoiceOrb } from "@agentfiber/voice-ui/canvas";

const canvas = document.querySelector("canvas");
const orb = canvas instanceof HTMLCanvasElement ? mountVoiceOrb(canvas) : null;

orb?.setMode("reactive");
orb?.setLevel(0.65);

// When capture or the surface closes:
orb?.setMode("off");
orb?.destroy();
```

`setLevel` accepts a normalized per-chunk peak. The controller folds peaks into a short fixed RMS
window and applies the shared fast-attack/slow-decay envelope. It runs requestAnimationFrame only
while its mode is active and the document is visible. `reducedMotion: true` paints one calm,
non-reactive frame instead of keeping an animation loop alive.

## React

```tsx
import { VoiceLevelBars, VoiceOrbCanvas } from "@agentfiber/voice-ui/react";

export function CaptureIndicator({ level }: { level: number }) {
  return (
    <div>
      <VoiceOrbCanvas
        mode="reactive"
        level={level}
        reducedMotion={window.matchMedia("(prefers-reduced-motion: reduce)").matches}
        aria-label="Listening"
      />
      <VoiceLevelBars level={level} aria-label="Microphone input level" />
    </div>
  );
}
```

The application owns mode selection, copy, layout, permission UI, and fallbacks. If WebGL is not a
good fit for the target, use `VoiceLevelBars` alone or build another renderer from the root exports.

## Product authority

Applications retain status-to-mode mapping, scheduling, layout, and all intent/dispatch policy. Reusing a visual component gives it no authority to execute a transcript or proposal.

For capture and transcription contracts, use [`@agentfiber/asr`](../agentfiber-asr/README.md). For
intent contracts and dispatch, use [`@agentfiber/voice`](../agentfiber-voice/README.md).

## Validate a checkout

From the repository root with Node 22.18.0 and pnpm 10.0.0:

```sh
pnpm --filter @agentfiber/voice-ui test
pnpm --filter @agentfiber/voice-ui typecheck
pnpm --filter @agentfiber/voice-ui smoke:pack
```

The packed-artifact smoke uses `npm pack`, rejects local dependency protocols, checks the public
peer boundary, installs the tarball in a clean consumer, and verifies every export plus TypeScript
declarations. Passing it is release evidence; it is not evidence that a version was published.

See the [voice package index](../../README.md) for related packages.
