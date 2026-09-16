# AgentFiber Voice

Composable voice packages for adaptive applications: capture and transcribe audio, normalize and match speech, and show voice activity.

## Packages

| Package | Purpose |
| --- | --- |
| [@agentfiber/voice](packages/agentfiber-voice) | Locale-neutral normalization, ordered matching, and dispatch contracts. |
| [@agentfiber/voice-grammar-en](packages/agentfiber-voice-grammar-en) | Optional English grammar, exact extensions, and directional parsing. |
| [@agentfiber/asr](packages/agentfiber-asr) | Provider-neutral transcription contracts, browser capture, HTTP, and Web Speech adapters. |
| [@agentfiber/voice-ui](packages/agentfiber-voice-ui) | Voice orb and level visuals, with optional canvas and React adapters. |

Install only the packages your application needs:

```sh
npm install @agentfiber/voice @agentfiber/voice-grammar-en
npm install @agentfiber/asr @agentfiber/voice-ui
```

Transcription produces data; matching produces proposals. Your application retains permission, policy, credentials, state, and execution authority. Visual components observe activity and do not execute actions.

Packages are independently versioned. Source changes here do not change already published npm releases.

## Agent skills

The [shared voice skill](SKILLS.md) covers all four packages, with installers for Codex/open Agent Skills and Claude Code. It is maintained and bundled in this repository.

## Development

Use Node.js 22.18 or newer and pnpm 10.0.0.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm smoke:pack
pnpm check:docs
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for validation and release guidance. Licensed under [MIT](LICENSE).
