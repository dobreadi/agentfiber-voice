# Agent skills

The [AgentFiber voice skill](packages/agentfiber-voice/skills/agentfiber-voice/SKILL.md) covers all four packages in this repository:

| Package | Skill guidance |
| --- | --- |
| `@agentfiber/voice` | Normalization, ordered matching, dispatch contracts, and application authority. |
| `@agentfiber/voice-grammar-en` | English defaults, exact extensions, collision rules, and directional-only adoption. |
| `@agentfiber/asr` | Capture, transcription adapters, cancellation, credentials, and lifecycle ownership. |
| `@agentfiber/voice-ui` | Orb and level visuals, canvas and React surfaces, fallbacks, and application-owned state. |

The shared skill also covers package selection, installation, and packed-consumer validation. Its canonical directory is bundled in the voice npm package; keeping one copy avoids inconsistent instructions across packages.

## Install from this checkout

From the repository root, install the current skill into your consuming project:

```sh
node packages/agentfiber-voice/bin/agentfiber-voice-skill.mjs install --target agents --root /path/to/your/project
node packages/agentfiber-voice/bin/agentfiber-voice-skill.mjs install --target claude-code --root /path/to/your/project
```

Use `--target all` for both tools, `--scope user` without `--root` for user-wide installation, or `--dry-run` to preview destinations. The installer refuses to overwrite different existing content.

These commands install the skill from this checkout. An npm installer command uses the skill from that published package version, which may differ from the current source.
