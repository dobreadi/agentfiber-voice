# `@agentfiber/voice`

Product-neutral deterministic voice matching and dispatch contracts for AgentFiber.

## Install and choose a package

```sh
npm install @agentfiber/voice
```

Use this package when you need contracts, normalization, ordered tier walking, or dispatch
types without any authored grammar. For conservative, extensible English UI defaults, install
the optional [`@agentfiber/voice-grammar-en`](../agentfiber-voice-grammar-en/README.md) locale
adapter instead; it depends on this package. Products that retain a complete grammar can use only its `@agentfiber/voice-grammar-en/directional` subpath.

The wider voice stack uses [`@agentfiber/asr`](../agentfiber-asr/README.md) for portable capture
and transcription contracts and [`@agentfiber/voice-ui`](../agentfiber-voice-ui/README.md) for
renderer-neutral orb/level visualisation. Those packages still return data or observations;
matching remains proposal-only and product policy/hosts retain execution authority.

The `0.1.x` surface is deliberately small:

- Unicode-aware transcript tokenization with caller-supplied token merges;
- an ordered, first-claim-wins tier walker with a required total fallback;
- pure synchronous matcher types; and
- transport-neutral dispatch, authority, cancellation, lifecycle, provenance, and observation
  contracts.

The package has zero runtime dependencies. It does not contain product utterances, navigation
policy, catalogue resolution, audio capture, ASR/TTS, UI/router bindings, model calls, or
television/medical vocabulary.

## Install the AgentFiber voice skill

Version `0.1.3` ships the portable Agent Skills directory with package-choice guidance for the
complete AgentFiber voice, ASR, English grammar, and voice UI stack. It includes an explicit,
fail-closed installer. Project installation does not run during `npm install` and does not symlink
a package cache into your repository.

For Claude Code:

```sh
npx --yes --package @agentfiber/voice@0.1.3 agentfiber-voice-skill install --target claude-code
```

This copies the skill to `.claude/skills/agentfiber-voice`.

For Codex and other tools that discover the open `.agents` convention:

```sh
npx --yes --package @agentfiber/voice@0.1.3 agentfiber-voice-skill install --target agents
```

This copies the skill to `.agents/skills/agentfiber-voice`. Use `--target all` to install both
project forms or add `--scope user` for `~/.claude/skills/agentfiber-voice` or
`~/.agents/skills/agentfiber-voice`. Re-running against identical content is safe. A different
existing skill is never overwritten; move or remove it explicitly after review.

The bundled [`SKILL.md`](./skills/agentfiber-voice/SKILL.md) covers package choice, exact imports,
extension collisions, the proposal/authority boundary, directional-only adoption, validation,
and release validation.

Matchers and grammars return proposals. They never grant authority or execute actions merely
because a phrase matched. Product policy decides whether a proposal is allowed, and a
product-owned host performs any accepted effect through the dispatch contract.

See the [development and validation guide](../../CONTRIBUTING.md).
See the [voice package index](../../README.md) for related packages.
