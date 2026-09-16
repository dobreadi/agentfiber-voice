import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertExactPackedDependencies, packPublicPackage } from "./lib/npm-artifact.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = join(root, "packages", "agentfiber-voice-ui");
const temp = mkdtempSync(join(tmpdir(), "agentfiber-voice-ui-pack-"));

try {
  const artifact = packPublicPackage(packageDir, temp);
  const { files, manifest, tarball } = artifact;
  if (files.some((file) => file.includes(".test."))) {
    throw new Error("packed artifact contains test files");
  }
  for (const required of [
    "package/LICENSE",
    "package/README.md",
    "package/dist/index.js",
    "package/dist/index.d.ts",
    "package/dist/canvas.js",
    "package/dist/canvas.d.ts",
    "package/dist/react.js",
    "package/dist/react.d.ts",
  ]) {
    if (!files.includes(required)) throw new Error(`packed artifact is missing ${required}`);
  }
  assertExactPackedDependencies(manifest, {});
  if (JSON.stringify(manifest.peerDependencies ?? {}) !== JSON.stringify({ react: ">=18" })) {
    throw new Error(
      `packed peerDependencies must be exactly {"react":">=18"}; found ${JSON.stringify(manifest.peerDependencies ?? {})}`,
    );
  }
  if (manifest.peerDependenciesMeta?.react?.optional !== true) {
    throw new Error("packed React peer must be explicitly optional for root/canvas consumers");
  }

  const consumer = join(temp, "consumer");
  mkdirSync(consumer);
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ name: "agentfiber-voice-ui-smoke", private: true, type: "module" }, null, 2),
  );
  writeFileSync(
    join(consumer, "smoke.mjs"),
    `import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { orbGlow, orbLevelTarget } from "@agentfiber/voice-ui";
import { mountVoiceOrb } from "@agentfiber/voice-ui/canvas";
import { VoiceLevelBars, VoiceOrbCanvas } from "@agentfiber/voice-ui/react";

assert.equal(orbGlow("reactive", 1), 1);
assert.equal(orbLevelTarget(new Float32Array([0, 1]), 2, 2), Math.sqrt(0.5));
assert.equal(mountVoiceOrb({ getContext: () => null }), null);
assert.match(renderToStaticMarkup(createElement(VoiceOrbCanvas, { mode: "breathe" })), /canvas/);
assert.match(renderToStaticMarkup(createElement(VoiceLevelBars, { level: 0.5 })), /rect/);
`,
  );
  writeFileSync(
    join(consumer, "smoke.tsx"),
    `import type { OrbMode } from "@agentfiber/voice-ui";
import type { VoiceOrbCanvasHandle } from "@agentfiber/voice-ui/canvas";
import { mountVoiceOrb } from "@agentfiber/voice-ui/canvas";
import { VoiceLevelBars, VoiceOrbCanvas } from "@agentfiber/voice-ui/react";

declare const canvas: HTMLCanvasElement;
const mode: OrbMode = "reactive";
const handle: VoiceOrbCanvasHandle | null = mountVoiceOrb(canvas);
handle?.setMode(mode);
handle?.setLevel(0.5);
void <VoiceOrbCanvas mode={mode} level={0.5} />;
void <VoiceLevelBars level={0.5} barCount={8} />;
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
      "react@19.2.6",
      "react-dom@19.2.6",
      "@types/react@19.2.15",
      "@types/react-dom@19.2.3",
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
      "--jsx",
      "react-jsx",
      "smoke.tsx",
    ],
    { cwd: consumer, stdio: "inherit" },
  );

  console.log(
    JSON.stringify(
      {
        package: "@agentfiber/voice-ui@0.1.1",
        tarball: artifact.tarballName,
        sha256: artifact.sha256,
        dependencyGraph: {
          dependencies: manifest.dependencies ?? {},
          optionalDependencies: manifest.optionalDependencies ?? {},
          peerDependencies: manifest.peerDependencies ?? {},
        },
        files,
        consumer: "root, canvas, React, SVG, SSR, and TypeScript declarations passed",
        published: false,
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
