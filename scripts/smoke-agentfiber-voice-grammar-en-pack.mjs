import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertExactPackedDependencies, packPublicPackage } from "./lib/npm-artifact.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = join(root, "packages", "agentfiber-voice-grammar-en");
const temp = mkdtempSync(join(tmpdir(), "agentfiber-voice-grammar-en-pack-"));

try {
  const artifact = packPublicPackage(packageDir, temp);
  const { files, manifest, tarball } = artifact;
  if (files.some((file) => file.includes(".test."))) {
    throw new Error("packed artifact contains test files");
  }
  for (const required of [
    "package/LICENSE",
    "package/dist/index.js",
    "package/dist/index.d.ts",
    "package/dist/directional.js",
    "package/dist/directional.d.ts",
  ]) {
    if (!files.includes(required)) throw new Error(`packed artifact is missing ${required}`);
  }

  assertExactPackedDependencies(manifest, { "@agentfiber/voice": "^0.1.0" });

  const consumer = join(temp, "consumer");
  mkdirSync(consumer);
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify(
      { name: "agentfiber-voice-grammar-en-smoke", private: true, type: "module" },
      null,
      2,
    ),
  );
  writeFileSync(
    join(consumer, "smoke.mjs"),
    `import assert from "node:assert/strict";
import { createEnglishVoiceMatcher, matchEnglishVoice } from "@agentfiber/voice-grammar-en";
import { parseEnglishDirectionalCommand } from "@agentfiber/voice-grammar-en/directional";

assert.deepEqual(matchEnglishVoice("please scroll right"), { kind: "move", direction: "right", steps: 3 });
assert.deepEqual(parseEnglishDirectionalCommand("page up"), { direction: "up", steps: 2 });

const match = createEnglishVoiceMatcher({
  wakePhrases: ["atlas"],
  extensionPhrases: [["open settings", { kind: "open-settings" }]],
  fallback: ({ transcript }) => ({ kind: "ask", question: transcript }),
});
assert.deepEqual(match("Atlas, could you open settings please?"), { kind: "open-settings" });
assert.deepEqual(match("find something calm"), { kind: "ask", question: "find something calm" });
`,
  );
  writeFileSync(
    join(consumer, "smoke.ts"),
    `import { createEnglishVoiceMatcher, type EnglishVoiceMatch } from "@agentfiber/voice-grammar-en";
import { parseEnglishDirectionalKey } from "@agentfiber/voice-grammar-en/directional";

type ProductIntent = { kind: "open-settings" } | { kind: "ask"; question: string };
const match: EnglishVoiceMatch<ProductIntent> = createEnglishVoiceMatcher<ProductIntent>({
  extensionPhrases: [["open settings", { kind: "open-settings" }]],
  fallback: ({ transcript }) => ({ kind: "ask", question: transcript }),
});
const result = match("open settings");
if (result.kind === "open-settings") parseEnglishDirectionalKey("left");
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
      "typescript@5.6.3",
    ],
    { cwd: consumer, stdio: "inherit" },
  );
  execFileSync(process.execPath, ["smoke.mjs"], { cwd: consumer, stdio: "inherit" });
  execFileSync(
    join(consumer, "node_modules", ".bin", "tsc"),
    [
      "--noEmit",
      "--strict",
      "--target",
      "ES2022",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "smoke.ts",
    ],
    { cwd: consumer, stdio: "inherit" },
  );

  console.log(
    JSON.stringify(
      {
        package: "@agentfiber/voice-grammar-en@0.1.3",
        tarball: artifact.tarballName,
        sha256: artifact.sha256,
        dependencyGraph: manifest.dependencies,
        files,
        consumer: "runtime and TypeScript declarations passed",
        published: false,
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
