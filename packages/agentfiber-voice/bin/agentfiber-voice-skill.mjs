#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const SKILL_NAME = "agentfiber-voice";
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLED_SKILL = join(PACKAGE_ROOT, "skills", SKILL_NAME);
const TARGETS = Object.freeze({
  "claude-code": [".claude", "skills"],
  agents: [".agents", "skills"],
});

const HELP = `Install the AgentFiber voice skill from @agentfiber/voice.

Usage:
  agentfiber-voice-skill install --target <claude-code|agents|all> [options]

Options:
  --scope <project|user>  Install for the current project (default) or current user
  --root <path>           Project root; defaults to the current working directory
  --dry-run               Validate and print destinations without writing
  --json                  Print machine-readable results
  --help                  Show this help

Project destinations:
  claude-code  .claude/skills/agentfiber-voice
  agents       .agents/skills/agentfiber-voice

The installer copies files and is idempotent when the destination is identical. It refuses
to overwrite a different skill; move or remove that directory explicitly before retrying.`;

function listFiles(directory, prefix = "") {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const absolute = join(directory, entry.name);
    const path = prefix === "" ? entry.name : join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(absolute, path));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`skill bundle contains unsupported entry: ${absolute}`);
    }
    files.push(path);
  }
  return files;
}

function assertSkillBundle(directory) {
  const skillFile = join(directory, "SKILL.md");
  if (!existsSync(skillFile) || !lstatSync(skillFile).isFile()) {
    throw new Error(`skill bundle is missing ${skillFile}`);
  }
  const source = readFileSync(skillFile, "utf8");
  if (!source.startsWith("---\n") || !source.includes(`\nname: ${SKILL_NAME}\n`)) {
    throw new Error(`skill bundle has invalid frontmatter: ${skillFile}`);
  }
}

function directoriesMatch(left, right) {
  if (!existsSync(left) || !existsSync(right)) return false;
  if (!lstatSync(left).isDirectory() || !lstatSync(right).isDirectory()) return false;
  const leftFiles = listFiles(left);
  const rightFiles = listFiles(right);
  if (leftFiles.length !== rightFiles.length) return false;
  for (let index = 0; index < leftFiles.length; index += 1) {
    if (leftFiles[index] !== rightFiles[index]) return false;
    if (
      !readFileSync(join(left, leftFiles[index])).equals(
        readFileSync(join(right, rightFiles[index])),
      )
    ) {
      return false;
    }
  }
  return true;
}

function resolveDestinations({ target, scope, root }) {
  const targetNames = target === "all" ? Object.keys(TARGETS) : [target];
  const base = scope === "user" ? homedir() : resolve(root ?? process.cwd());
  return targetNames.map((targetName) => ({
    target: targetName,
    destination: join(base, ...TARGETS[targetName], SKILL_NAME),
  }));
}

function assertSafeDestination(destination) {
  if (basename(destination) !== SKILL_NAME) {
    throw new Error(`refusing unexpected skill destination: ${destination}`);
  }
  const parent = dirname(destination);
  const relativeDestination = relative(parent, destination);
  if (
    relativeDestination === "" ||
    relativeDestination === ".." ||
    relativeDestination.startsWith(`..${sep}`)
  ) {
    throw new Error(`refusing unsafe skill destination: ${destination}`);
  }
}

export function installBundledSkill({ target, scope = "project", root, dryRun = false } = {}) {
  if (!(target in TARGETS) && target !== "all") {
    throw new Error("--target must be claude-code, agents, or all");
  }
  if (scope !== "project" && scope !== "user") {
    throw new Error("--scope must be project or user");
  }
  if (scope === "user" && root !== undefined) {
    throw new Error("--root cannot be combined with --scope user");
  }

  assertSkillBundle(BUNDLED_SKILL);
  const plans = resolveDestinations({ target, scope, root }).map((plan) => {
    assertSafeDestination(plan.destination);
    if (!existsSync(plan.destination)) return { ...plan, status: "install" };
    if (directoriesMatch(BUNDLED_SKILL, plan.destination)) {
      return { ...plan, status: "unchanged" };
    }
    throw new Error(
      `refusing to overwrite different skill at ${plan.destination}; move or remove it explicitly`,
    );
  });

  if (!dryRun) {
    for (const plan of plans) {
      if (plan.status !== "install") continue;
      const parent = dirname(plan.destination);
      mkdirSync(parent, { recursive: true });
      const temporary = mkdtempSync(join(parent, `.${SKILL_NAME}-`));
      try {
        cpSync(BUNDLED_SKILL, temporary, { recursive: true, errorOnExist: true });
        renameSync(temporary, plan.destination);
      } finally {
        rmSync(temporary, { recursive: true, force: true });
      }
    }
  }

  return plans.map((plan) => ({
    ...plan,
    status: dryRun && plan.status === "install" ? "would-install" : plan.status,
  }));
}

function parseCli(args) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      target: { type: "string" },
      scope: { type: "string", default: "project" },
      root: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) return { help: true, json: values.json };
  if (positionals.length !== 1 || positionals[0] !== "install") {
    throw new Error("expected the install command; use --help for usage");
  }
  return {
    target: values.target,
    scope: values.scope,
    root: values.root,
    dryRun: values["dry-run"],
    json: values.json,
  };
}

export function runCli(args = process.argv.slice(2)) {
  const options = parseCli(args);
  if (options.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  const results = installBundledSkill(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return;
  }
  for (const result of results) {
    process.stdout.write(`${result.target}: ${result.status} ${result.destination}\n`);
  }
}

const modulePath = realpathSync(fileURLToPath(import.meta.url));
const invokedPath = process.argv[1] === undefined ? undefined : realpathSync(process.argv[1]);
if (invokedPath === modulePath) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`agentfiber-voice-skill: ${error.message}\n`);
    process.exitCode = 1;
  }
}
