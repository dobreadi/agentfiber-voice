import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { installBundledSkill } from "../bin/agentfiber-voice-skill.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(packageRoot, "bin", "agentfiber-voice-skill.mjs");
const sourceSkill = join(packageRoot, "skills", "agentfiber-voice", "SKILL.md");

function withTempProject(run) {
  const project = mkdtempSync(join(tmpdir(), "agentfiber-voice-skill-test-"));
  try {
    return run(project);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
}

test("installs identical copies for Claude Code and .agents", () =>
  withTempProject((project) => {
    const installed = installBundledSkill({ target: "all", root: project });
    assert.deepEqual(
      installed.map(({ target, status }) => ({ target, status })),
      [
        { target: "claude-code", status: "install" },
        { target: "agents", status: "install" },
      ],
    );

    const expected = readFileSync(sourceSkill, "utf8");
    assert.equal(
      readFileSync(join(project, ".claude", "skills", "agentfiber-voice", "SKILL.md"), "utf8"),
      expected,
    );
    assert.equal(
      readFileSync(join(project, ".agents", "skills", "agentfiber-voice", "SKILL.md"), "utf8"),
      expected,
    );

    const repeated = installBundledSkill({ target: "all", root: project });
    assert.deepEqual(
      repeated.map(({ target, status }) => ({ target, status })),
      [
        { target: "claude-code", status: "unchanged" },
        { target: "agents", status: "unchanged" },
      ],
    );
  }));

test("dry-run validates destinations without writing", () =>
  withTempProject((project) => {
    const result = installBundledSkill({ target: "agents", root: project, dryRun: true });
    assert.equal(result[0].status, "would-install");
    assert.throws(
      () => readFileSync(join(project, ".agents", "skills", "agentfiber-voice", "SKILL.md")),
      /ENOENT/,
    );
  }));

test("a collision fails before any target is installed", () =>
  withTempProject((project) => {
    const collision = join(project, ".claude", "skills", "agentfiber-voice", "SKILL.md");
    mkdirSync(dirname(collision), { recursive: true });
    writeFileSync(collision, "different\n");

    assert.throws(
      () => installBundledSkill({ target: "all", root: project }),
      /refusing to overwrite different skill/,
    );
    assert.throws(
      () => readFileSync(join(project, ".agents", "skills", "agentfiber-voice", "SKILL.md")),
      /ENOENT/,
    );
  }));

test("user scope rejects a project root override", () => {
  assert.throws(
    () => installBundledSkill({ target: "agents", scope: "user", root: "/tmp/project" }),
    /--root cannot be combined with --scope user/,
  );
});

test("CLI supports an explicit project root and JSON output", () =>
  withTempProject((project) => {
    const output = execFileSync(
      process.execPath,
      [cli, "install", "--target", "agents", "--root", project, "--json"],
      { encoding: "utf8" },
    );
    const result = JSON.parse(output);
    assert.equal(result[0].target, "agents");
    assert.equal(result[0].status, "install");
    assert.equal(result[0].destination, join(project, ".agents", "skills", "agentfiber-voice"));
  }));

test("CLI rejects unknown targets", () => {
  const result = spawnSync(process.execPath, [cli, "install", "--target", "unknown"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--target must be claude-code, agents, or all/);
});
