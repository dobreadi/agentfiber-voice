---
name: agentfiber-voice
description: Use AgentFiber voice, ASR, English grammar, and voice UI packages with explicit application authority, lifecycle, and validation.
---

# AgentFiber voice

## Choose the smallest surface

- Use `@agentfiber/voice` for `createVoiceNormalizer`, `defaultVoiceNormalizer`,
  `walkVoiceMatchTiers`, matcher types, and the `VoiceDispatch*`/lifecycle/provenance contracts.
- Use the `@agentfiber/voice-grammar-en` root for `matchEnglishVoice`,
  `createEnglishVoiceMatcher`, conservative English base intents, and bounded exact extensions.
- Use `@agentfiber/voice-grammar-en/directional` for
  `parseEnglishDirectionalCommand`, `parseEnglishDirectionalKey`,
  `ENGLISH_DIRECTIONAL_PATTERN`, and `ENGLISH_DIRECTIONAL_MAX_STEPS` when a product retains its
  own full grammar.
- Use `@agentfiber/asr` for provider-neutral audio/transcript contracts,
  `@agentfiber/asr/browser` for bounded PCM/WAV capture, `@agentfiber/asr/http` for an injected
  endpoint or OpenAI-compatible Whisper wire adapter, and `@agentfiber/asr/web-speech` for an
  optional browser transcript source.
- Use `@agentfiber/voice-ui` for renderer-neutral orb math/GLSL,
  `@agentfiber/voice-ui/canvas` for raw WebGL, and `@agentfiber/voice-ui/react` for the React
  canvas component or bounded SVG level bars.

Use the published entry points directly:

```ts
import {
  createVoiceNormalizer,
  defaultVoiceNormalizer,
  walkVoiceMatchTiers,
  type VoiceDispatchHost,
  type VoiceDispatchRequest,
  type VoiceDispatchResult,
} from "@agentfiber/voice";
import {
  createEnglishVoiceMatcher,
  matchEnglishVoice,
  type EnglishVoiceMatch,
} from "@agentfiber/voice-grammar-en";
import {
  parseEnglishDirectionalCommand,
  parseEnglishDirectionalKey,
} from "@agentfiber/voice-grammar-en/directional";
import type { AsrTranscriber, AsrTranscriptSource } from "@agentfiber/asr";
import { startBrowserAudioCapture } from "@agentfiber/asr/browser";
import {
  createHttpAsrTranscriber,
  createOpenAiCompatibleWhisperTranscriber,
} from "@agentfiber/asr/http";
import { createWebSpeechTranscriptSource } from "@agentfiber/asr/web-speech";
import { orbLevelTarget, type OrbMode } from "@agentfiber/voice-ui";
import { mountVoiceOrb } from "@agentfiber/voice-ui/canvas";
import { VoiceLevelBars, VoiceOrbCanvas } from "@agentfiber/voice-ui/react";
```

Install the package containing the import. The directional path is an export of
`@agentfiber/voice-grammar-en`, whose public dependency on `@agentfiber/voice` is `^0.1.0`.

## Preserve proposal and authority boundaries

Normalization and matching are pure, synchronous proposal mechanisms. A matched intent never
grants authority and never performs an effect. Product policy accepts or rejects the proposal;
a product-owned host executes accepted work through an explicit dispatch contract with
authority, cancellation, lifecycle, and observation.

ASR yields audio or transcripts; visual components observe lifecycle and level. Neither may
match an intent, grant authority, retain product data by default, or execute an effect. Keep
endpoint authentication, provider/model choice, consent and retention UX, status mapping, copy,
layout, accessibility admission, and fallbacks in the product or an explicit provider adapter.
Importing root packages must not touch browser, microphone, network, WebGL, or React runtime
state.

## Extend without collisions

`createEnglishVoiceMatcher` copies and validates configuration on its cold factory path. Exact
extensions run before base phrases, but may not replace them. Empty phrases, normalized
duplicates, built-in collisions, and phrases parsed as directional commands throw immediately.
Caller regexes and arbitrary tier reordering are intentionally absent; compose
`walkVoiceMatchTiers` from `@agentfiber/voice` for contextual or custom tiers.

## Install this portable skill

`@agentfiber/voice` ships this directory unchanged. Use its explicit installer; do not use an
npm `postinstall` hook or symlink a package cache into a project.

```sh
# Claude Code project skill
npx --yes --package @agentfiber/voice@0.1.2 agentfiber-voice-skill install --target claude-code

# Open Agent Skills / Codex project skill
npx --yes --package @agentfiber/voice@0.1.2 agentfiber-voice-skill install --target agents
```

The destinations are `.claude/skills/agentfiber-voice` and
`.agents/skills/agentfiber-voice`. Add `--scope user` for the corresponding user directory, or
use `--target all` to install both forms. The installer copies atomically, treats identical
content as already installed, and refuses to overwrite a different skill.

## Validate changes and releases

The artifact smoke must use `npm pack`, inspect the manifest inside the tarball, reject every
`workspace:`, `link:`, or `file:` dependency/optionalDependency/peerDependency, preserve the
exact grammar-to-voice dependency `^0.1.0`, and install into a clean consumer. It must also
invoke the packaged skill installer and verify the copied skill. Record the source commit,
tarball hash/file list/dependency graph, and skipped gates. A smoke pass is not evidence of
publication.

For source changes, run `pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm smoke:pack` from the repository root. Configure npm trusted publishing for this repository before a future release; source extraction does not publish new registry versions.
