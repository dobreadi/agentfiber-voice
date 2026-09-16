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

### Configure npm trusted publishing

For each of the four packages, open its npm settings and add a GitHub Actions trusted publisher:

- Organization/user: `dobreadi`
- Repository: `agentfiber-voice`
- Workflow filename: `publish.yml`
- Environment: leave empty (the workflow uses no GitHub environment)
- Allowed action: publish

The [npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/) explains the setup. The workflow uses GitHub OIDC and provenance; no npm token secret or local `npm login` is needed. The workflow cannot configure this package-level trust itself.

### Run a release

1. Merge reviewed version bumps and wait for CI to pass.
2. Open **Actions → Publish npm packages → Run workflow** on `main`.
3. Select `all`, `voice`, `voice-grammar-en`, `asr`, or `voice-ui`.
4. Leave **Validate and pack without publishing** checked for a dry run. Uncheck it to publish.
5. Inspect the run summary for the published versions and verified tarball hashes.

The workflow validates all packages and packed consumers, checks that every selected version is new and newer than its current `latest`, and packs the entire selection before publishing. `all` publishes voice before English grammar, followed by ASR and voice UI. Runs are serialized, and actual publication is restricted to this repository's `main` branch.

Versions come from the manifests; the action does not bump versions. Existing npm versions are immutable. If a run partially publishes before failing, select each remaining package individually on retry. An `all` run fails preflight if any selected version already exists. Registry/authentication errors stop the run rather than being treated as missing versions.

After each publication the workflow checks repository metadata, exact tarball integrity, and the `latest` tag. Ordinary pushes and PRs run CI only; they never publish.

To validate release logic locally, run `pnpm test:release`. To exercise preflight and packing without publishing, run `RELEASE_PACKAGE=all RELEASE_DRY_RUN=true node scripts/publish.mjs` after installing and building.

## Documentation

Document these packages and their public APIs. Link related packages through the repository index. Do not include unrelated product repositories, private operations, credentials, or historical product evidence.
