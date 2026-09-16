import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packPublicPackage } from './lib/npm-artifact.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPOSITORY = 'git+https://github.com/dobreadi/agentfiber-voice.git';
const REGISTRY = 'https://registry.npmjs.org';
export const PACKAGE_ORDER = ['voice', 'voice-grammar-en', 'asr', 'voice-ui'];

export function selectPackages(selection) {
  if (selection === 'all') return [...PACKAGE_ORDER];
  if (!PACKAGE_ORDER.includes(selection)) throw new Error(`Unknown package selection: ${selection}`);
  return [selection];
}

export function parseDryRun(value) {
  if (value !== 'true' && value !== 'false') throw new Error('RELEASE_DRY_RUN must be true or false');
  return value === 'true';
}

export function assertPublishContext(env) {
  if (env.GITHUB_ACTIONS !== 'true' || env.GITHUB_REPOSITORY !== 'dobreadi/agentfiber-voice' || env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error('Publishing requires the main branch in the configured GitHub Actions repository');
  }
}

export async function registryVersion(name, version, fetcher = fetch) {
  const response = await fetcher(`${REGISTRY}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Registry lookup failed for ${name}@${version}: HTTP ${response.status}`);
  return response.json();
}

function stableVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Expected a stable release version, got ${version}`);
  return version.split('.').map(Number);
}

function newerThan(version, previous) {
  const a = stableVersion(version), b = stableVersion(previous);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

export async function preflight(manifests, lookup = registryVersion) {
  // Check the entire selection before publishing any package.
  for (const manifest of manifests) {
    stableVersion(manifest.version);
    if (manifest.private || manifest.repository?.url !== REPOSITORY) throw new Error(`Invalid release manifest for ${manifest.name}`);
    if (await lookup(manifest.name, manifest.version)) throw new Error(`${manifest.name}@${manifest.version} already exists. Bump its version or select a remaining package individually.`);
    const latest = await lookup(manifest.name, 'latest');
    if (!latest) throw new Error(`Expected existing npm package ${manifest.name}; configure ownership before publishing`);
    if (!newerThan(manifest.version, latest.version)) throw new Error(`${manifest.name}@${manifest.version} would move latest backwards from ${latest.version}`);
  }
}

export function verifyPublished(manifest, artifact, published) {
  if (published?.name !== manifest.name || published.version !== manifest.version || published.repository?.url !== REPOSITORY || published.dist?.integrity !== artifact.integrity) {
    throw new Error(`Registry metadata or tarball integrity mismatch for ${manifest.name}@${manifest.version}`);
  }
}

function report(text) {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n\n`);
}

async function main() {
  const selected = selectPackages(process.env.RELEASE_PACKAGE);
  const dryRun = parseDryRun(process.env.RELEASE_DRY_RUN);
  if (!dryRun) assertPublishContext(process.env);
  const manifests = selected.map(key => JSON.parse(readFileSync(join(ROOT, 'packages', `agentfiber-${key}`, 'package.json'), 'utf8')));
  await preflight(manifests);
  const temp = mkdtempSync(join(tmpdir(), 'agentfiber-release-'));
  try {
    const artifacts = selected.map((key, i) => {
      const destination = join(temp, key);
      mkdirSync(destination);
      const artifact = packPublicPackage(join(ROOT, 'packages', `agentfiber-${key}`), destination);
      if (artifact.manifest.name !== manifests[i].name || artifact.manifest.version !== manifests[i].version || artifact.manifest.repository?.url !== REPOSITORY) throw new Error(`Packed identity mismatch for ${key}`);
      return { ...artifact, integrity: `sha512-${createHash('sha512').update(readFileSync(artifact.tarball)).digest('base64')}` };
    });
    for (let i = 0; i < selected.length; i++) {
      const manifest = manifests[i], artifact = artifacts[i];
      if (dryRun) {
        report(`Dry run: ${manifest.name}@${manifest.version}; SHA-256 ${artifact.sha256}. Nothing published.`);
        continue;
      }
      execFileSync('npm', ['publish', artifact.tarball, '--access', 'public', '--tag', 'latest', '--provenance', '--registry', REGISTRY], { cwd: ROOT, stdio: 'inherit' });
      let published;
      for (let attempt = 0; attempt < 6; attempt++) {
        published = await registryVersion(manifest.name, manifest.version);
        if (published) break;
        await new Promise(resolve => setTimeout(resolve, 5_000));
      }
      verifyPublished(manifest, artifact, published);
      const latest = await registryVersion(manifest.name, 'latest');
      if (latest?.version !== manifest.version) throw new Error(`latest tag mismatch for ${manifest.name}`);
      report(`Published ${manifest.name}@${manifest.version}; SHA-256 ${artifact.sha256}; repository, integrity, and latest verified.`);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
