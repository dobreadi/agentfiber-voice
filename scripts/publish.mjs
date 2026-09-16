import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  const existing = [];
  for (const manifest of manifests) {
    stableVersion(manifest.version);
    if (manifest.private || manifest.repository?.url !== REPOSITORY) throw new Error(`Invalid release manifest for ${manifest.name}`);
    const published = await lookup(manifest.name, manifest.version);
    if (published && (published.repository?.url !== REPOSITORY || published.name !== manifest.name || published.version !== manifest.version)) throw new Error(`Existing release identity mismatch for ${manifest.name}`);
    existing.push(published);
    const latest = await lookup(manifest.name, 'latest');
    if (!latest) throw new Error(`Expected existing npm package ${manifest.name}; configure ownership before publishing`);
    if (!(published && latest.version === manifest.version) && !newerThan(manifest.version, latest.version)) throw new Error(`${manifest.name}@${manifest.version} would move latest backwards from ${latest.version}`);
  }
  return existing;
}

export function verifyPublished(manifest, artifact, published) {
  if (published?.name !== manifest.name || published.version !== manifest.version || published.repository?.url !== REPOSITORY || published.dist?.integrity !== artifact.integrity) {
    throw new Error(`Registry metadata or tarball integrity mismatch for ${manifest.name}@${manifest.version}`);
  }
}

export function archiveContents(tarball) {
  const names = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).trim().split('\n').filter(name => !name.endsWith('/')).sort();
  if (new Set(names).size !== names.length || names.some(name => !name.startsWith('package/') || name.split('/').includes('..'))) throw new Error('Invalid package archive paths');
  return names.map(name => [name, createHash('sha256').update(execFileSync('tar', ['-xOf', tarball, '--', name])).digest('hex')]);
}

export async function verifyExisting(manifest, artifact, published, destination) {
  verifyPublished(manifest, { integrity: published.dist?.integrity }, published);
  const url = new URL(published.dist.tarball);
  if (url.protocol !== 'https:' || url.hostname !== 'registry.npmjs.org') throw new Error('Unexpected registry tarball origin');
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
  if (!response.ok) throw new Error(`Registry tarball download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== published.dist.integrity) throw new Error('Registry tarball integrity mismatch');
  writeFileSync(destination, bytes);
  // gzip/tar metadata can vary across operating systems; compare every packed path and file byte.
  if (JSON.stringify(archiveContents(artifact.tarball)) !== JSON.stringify(archiveContents(destination))) throw new Error(`Existing package contents differ for ${manifest.name}@${manifest.version}`);
}

export async function waitForPublication(manifest, artifact, lookup = registryVersion, pause = ms => new Promise(resolve => setTimeout(resolve, ms)), attempts = 61) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const published = await lookup(manifest.name, manifest.version);
    if (published) {
      verifyPublished(manifest, artifact, published);
      const latest = await lookup(manifest.name, 'latest');
      if (latest?.version === manifest.version) return;
    }
    if (attempt + 1 < attempts) await pause(10_000);
  }
  throw new Error(`npm accepted ${manifest.name}@${manifest.version}, but registry processing or latest propagation is still pending. Re-run this selection later; matching published artifacts are verified and skipped.`);
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
  const existing = await preflight(manifests);
  const temp = mkdtempSync(join(tmpdir(), 'agentfiber-release-'));
  try {
    const artifacts = selected.map((key, i) => {
      const destination = join(temp, key);
      mkdirSync(destination);
      const artifact = packPublicPackage(join(ROOT, 'packages', `agentfiber-${key}`), destination);
      if (artifact.manifest.name !== manifests[i].name || artifact.manifest.version !== manifests[i].version || artifact.manifest.repository?.url !== REPOSITORY) throw new Error(`Packed identity mismatch for ${key}`);
      return { ...artifact, integrity: `sha512-${createHash('sha512').update(readFileSync(artifact.tarball)).digest('base64')}` };
    });
    // Verify every existing artifact before any new publication; retries may only skip identical bytes.
    for (let i = 0; i < selected.length; i++) {
      if (existing[i]) await verifyExisting(manifests[i], artifacts[i], existing[i], join(temp, `existing-${i}.tgz`));
    }
    for (let i = 0; i < selected.length; i++) {
      const manifest = manifests[i], artifact = artifacts[i];
      if (dryRun) {
        report(`Dry run: ${manifest.name}@${manifest.version}; SHA-256 ${artifact.sha256}. Nothing published.`);
        continue;
      }
      if (existing[i]) {
        await waitForPublication(manifest, { integrity: existing[i].dist.integrity });
        report(`Already published and verified: ${manifest.name}@${manifest.version}; identical package contents, no publish repeated.`);
        continue;
      }
      execFileSync('npm', ['publish', artifact.tarball, '--access', 'public', '--tag', 'latest', '--provenance', '--registry', REGISTRY], { cwd: ROOT, stdio: 'inherit' });
      await waitForPublication(manifest, artifact);
      report(`Published ${manifest.name}@${manifest.version}; SHA-256 ${artifact.sha256}; repository, integrity, and latest verified.`);
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
