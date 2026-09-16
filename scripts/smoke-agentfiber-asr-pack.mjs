import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertExactPackedDependencies, packPublicPackage } from "./lib/npm-artifact.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = join(root, "packages", "agentfiber-asr");
const temp = mkdtempSync(join(tmpdir(), "agentfiber-asr-pack-"));

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
    "package/dist/browser.js",
    "package/dist/browser.d.ts",
    "package/dist/http.js",
    "package/dist/http.d.ts",
    "package/dist/web-speech.js",
    "package/dist/web-speech.d.ts",
  ]) {
    if (!files.includes(required)) throw new Error(`packed artifact is missing ${required}`);
  }
  assertExactPackedDependencies(manifest, {});

  const consumer = join(temp, "consumer");
  mkdirSync(consumer);
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify({ name: "agentfiber-asr-smoke", private: true, type: "module" }, null, 2),
  );
  writeFileSync(
    join(consumer, "smoke.mjs"),
    `import assert from "node:assert/strict";
import { finalTranscript } from "@agentfiber/asr";
import { concatPcmChunks, encodePcm16Wav, resamplePcmLinear } from "@agentfiber/asr/browser";
import { createHttpAsrTranscriber } from "@agentfiber/asr/http";
import { supportsWebSpeechRecognition } from "@agentfiber/asr/web-speech";

assert.deepEqual(finalTranscript("  hello  ", "en-GB"), { text: "hello", final: true, locale: "en-GB" });
const pcm = concatPcmChunks([new Float32Array([0, 0.5]), new Float32Array([-0.5])], 3);
assert.equal(resamplePcmLinear(pcm, 48_000, 16_000).length, 1);
assert.equal(encodePcm16Wav(pcm, 16_000).slice(0, 4).toString(), "82,73,70,70");
assert.equal(supportsWebSpeechRecognition(), false);

const transcriber = createHttpAsrTranscriber({
  endpoint: "https://asr.invalid/transcribe",
  fetch: async (_input, init) => {
    assert.equal(init.method, "POST");
    return new Response(JSON.stringify({ text: "go back" }), { status: 200 });
  },
});
const result = await transcriber.transcribe({
  requestId: "smoke",
  audio: { bytes: new Uint8Array([1]), contentType: "audio/wav" },
  signal: new AbortController().signal,
});
assert.deepEqual(result, { status: "completed", transcript: { text: "go back", final: true } });
`,
  );
  writeFileSync(
    join(consumer, "smoke.ts"),
    `import type { AsrTranscriber, AsrTranscriptSource } from "@agentfiber/asr";
import { startBrowserAudioCapture } from "@agentfiber/asr/browser";
import { createOpenAiCompatibleWhisperTranscriber } from "@agentfiber/asr/http";
import { createWebSpeechTranscriptSource } from "@agentfiber/asr/web-speech";

declare const transcriber: AsrTranscriber;
declare const source: AsrTranscriptSource;
void transcriber.lifecycle;
void source.lifecycle;
void startBrowserAudioCapture;
void createOpenAiCompatibleWhisperTranscriber;
void createWebSpeechTranscriptSource;
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
        package: "@agentfiber/asr@0.1.0",
        tarball: artifact.tarballName,
        sha256: artifact.sha256,
        dependencyGraph: {
          dependencies: manifest.dependencies ?? {},
          optionalDependencies: manifest.optionalDependencies ?? {},
          peerDependencies: manifest.peerDependencies ?? {},
        },
        files,
        consumer: "root, browser, HTTP, Web Speech, and TypeScript declarations passed",
        published: false,
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
