# `@agentfiber/voice-grammar-en`

An optional, extensible English grammar for deterministic AgentFiber voice matching.

## Install and choose a package

```sh
npm install @agentfiber/voice-grammar-en
```

Use the root export for conservative English defaults plus bounded exact product extensions.
Use `@agentfiber/voice-grammar-en/directional` when a product retains its own
complete grammar and only wants the directional parser. Use
[`@agentfiber/voice`](../agentfiber-voice/README.md) directly when you need contracts,
normalization, custom tier walking, or dispatch without English defaults. The grammar package
already declares `@agentfiber/voice` as a runtime dependency.

The package deliberately sits beside `@agentfiber/voice`, not inside it:

- applications that do not need an English grammar do not install or load it;
- locale grammar and substrate contracts can version independently; and
- `@agentfiber/voice` remains product- and locale-neutral.

It ships conservative UI intents for back, dismiss, activate, help, directional movement, and
an explicit `unmatched` result. Matching is pure and synchronous. It performs no I/O, executes
no action, grants no authority, creates no timers, and has no product, TV, home, or medical
vocabulary.

## Use the defaults

```ts
import { matchEnglishVoice } from "@agentfiber/voice-grammar-en";

matchEnglishVoice("please scroll right");
// { kind: "move", direction: "right", steps: 3 }

matchEnglishVoice("something product-specific");
// { kind: "unmatched", transcript: "something product-specific", normalized: "..." }
```

`unmatched` is intentional. A reusable grammar must not silently turn an unknown household,
television, or clinical command into a search or an action.

## Extend it for a product

```ts
import { createEnglishVoiceMatcher } from "@agentfiber/voice-grammar-en";

type ProductIntent =
  | { kind: "open-settings" }
  | { kind: "ask"; question: string };

const match = createEnglishVoiceMatcher<ProductIntent>({
  wakePhrases: ["atlas", "hey atlas", "okay atlas"],
  extensionPhrases: [["open settings", { kind: "open-settings" }]],
  fallback: ({ transcript }) => ({ kind: "ask", question: transcript }),
});

match("Hey Atlas, could you open settings please?");
// { kind: "open-settings" }
```

Configuration is copied at factory creation. Extension phrases may add product intents or new
synonyms, but may not replace a built-in phrase or directional command; normalized collisions
fail immediately. The
returned intents are proposals only. A policy/host layer must still decide whether and how to
execute them, normally through the dispatch contracts in `@agentfiber/voice`.

For custom regex or contextual tiers, compose the lower-level `walkVoiceMatchTiers` API from
`@agentfiber/voice`. This package keeps its extension surface to bounded exact phrases so
caller-authored patterns cannot silently reorder protected escape commands.

## Directional-only import

Consumers that already own a full grammar can import only the proven English directional
parser:

```ts
import { parseEnglishDirectionalCommand } from "@agentfiber/voice-grammar-en/directional";

parseEnglishDirectionalCommand("page left");
// { direction: "left", steps: 6 }
```

Explicit counts win; otherwise `scroll` means 3 horizontal or 2 vertical steps, `page` means 6
horizontal or 2 vertical steps, and other forms mean one step. Counts are capped at 10.



## Install the shared usage skill

The portable AgentFiber voice usage skill ships from `@agentfiber/voice@0.1.3`, rather than being
duplicated in every locale adapter. Install it into a project with either command:

```sh
# Claude Code
npx --yes --package @agentfiber/voice@0.1.3 agentfiber-voice-skill install --target claude-code

# Codex and the open .agents convention
npx --yes --package @agentfiber/voice@0.1.3 agentfiber-voice-skill install --target agents
```

The grammar dependency remains `@agentfiber/voice: ^0.1.0`. Package versions are independent.

See the [development and validation guide](../../CONTRIBUTING.md).
See the [voice package index](../../README.md) for related packages.
