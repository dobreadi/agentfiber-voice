# Contributing

Keep changes within the four voice packages. Preserve explicit teardown, cancellation, bounded resources, and the separation between proposals and application authority.

## Validation

From the repository root, use Node.js 22.18 or newer and pnpm 10.0.0:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm smoke:pack
pnpm check:docs
```

The packed-consumer checks build with `npm pack`, inspect the actual tarball manifest and exports, reject local dependency protocols, install into temporary consumers, and validate runtime behavior and TypeScript declarations. The voice check also exercises the packaged skill installer. These checks require access to the npm registry.

Use `pnpm --filter @agentfiber/asr test` (or another package name) for a focused test run.

## Releases

Each package keeps its own version. The English grammar depends on `@agentfiber/voice: ^0.1.0`; do not publish literal `workspace:`, `file:`, or `link:` dependencies.

This repository's CI validates code and artifacts; it does not publish to npm. Before a future release, configure the package's npm trusted publisher for this repository and the reviewed publishing workflow, then verify the exact version, dependency graph, tarball contents, and clean-consumer results. Existing registry versions are unchanged by this extraction.

## Documentation

Document these packages and their public APIs. Link related packages through the repository index. Do not include unrelated product repositories, private operations, credentials, or historical product evidence.
