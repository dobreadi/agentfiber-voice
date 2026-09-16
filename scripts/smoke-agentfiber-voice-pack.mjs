import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { packPublicPackage } from "./lib/npm-artifact.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = join(root, "packages", "agentfiber-voice");
const temp = mkdtempSync(join(tmpdir(), "agentfiber-voice-pack-"));

try {
  const artifact = packPublicPackage(packageDir, temp);
  const { files, tarball } = artifact;
  if (files.some((file) => file.includes(".test."))) {
    throw new Error("packed artifact contains test files");
  }
  if (!files.includes("package/dist/index.js") || !files.includes("package/dist/index.d.ts")) {
    throw new Error("packed artifact is missing its runtime or declaration entry");
  }
  for (const required of [
    "package/LICENSE",
    "package/bin/agentfiber-voice-skill.mjs",
    "package/skills/agentfiber-voice/SKILL.md",
  ]) {
    if (!files.includes(required)) throw new Error(`packed artifact is missing ${required}`);
  }

  const consumer = join(temp, "consumer");
  mkdirSync(consumer);
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ name: "agentfiber-voice-smoke", private: true, type: "module" }, null, 2),
  );
  writeFileSync(
    join(consumer, "smoke.mjs"),
    `import assert from "node:assert/strict";
import { createVoiceNormalizer, defaultVoiceNormalizer, walkVoiceMatchTiers } from "@agentfiber/voice";

assert.deepEqual(defaultVoiceNormalizer.tokenize("watch list").lower, ["watch", "list"]);
const adapted = createVoiceNormalizer({ tokenMerges: [["watch", "list", "watchlist"]] });
assert.equal(adapted.normalize("Watch List!"), "watchlist");

const intent = walkVoiceMatchTiers(
  [{ tier: "exact", claim: ({ key }) => key === "back" ? { intent: { kind: "back" } } : null }],
  { key: "unknown" },
  () => ({ kind: "fallback" }),
);
assert.deepEqual(intent, { kind: "fallback" });
`,
  );

  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--cache",
      join(temp, "npm-cache"),
      tarball,
    ],
    { cwd: consumer, stdio: "inherit" },
  );
  execFileSync(process.execPath, ["smoke.mjs"], { cwd: consumer, stdio: "inherit" });
  const installedCli = join(
    consumer,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "agentfiber-voice-skill.cmd" : "agentfiber-voice-skill",
  );
  execFileSync(installedCli, ["install", "--target", "all"], {
    cwd: consumer,
    stdio: "inherit",
  });
  execFileSync(installedCli, ["install", "--target", "all"], {
    cwd: consumer,
    stdio: "inherit",
  });
  const packagedSkill = readFileSync(
    join(
      consumer,
      "node_modules",
      "@agentfiber",
      "voice",
      "skills",
      "agentfiber-voice",
      "SKILL.md",
    ),
  );
  for (const installedSkill of [
    join(consumer, ".claude", "skills", "agentfiber-voice", "SKILL.md"),
    join(consumer, ".agents", "skills", "agentfiber-voice", "SKILL.md"),
  ]) {
    if (!readFileSync(installedSkill).equals(packagedSkill)) {
      throw new Error(`installed skill differs from packed source: ${installedSkill}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        package: "@agentfiber/voice@0.1.2",
        tarball: artifact.tarballName,
        sha256: artifact.sha256,
        dependencyGraph: {
          dependencies: artifact.manifest.dependencies ?? {},
          optionalDependencies: artifact.manifest.optionalDependencies ?? {},
          peerDependencies: artifact.manifest.peerDependencies ?? {},
        },
        files,
        consumer: "runtime and skill installers passed",
        published: false,
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
