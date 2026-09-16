import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packages = new Set(readdirSync(resolve(root, 'packages')).map(dir => JSON.parse(readFileSync(resolve(root, 'packages', dir, 'package.json'), 'utf8')).name));
function visit(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist'].includes(item.name)) continue;
    const path = resolve(dir, item.name);
    if (item.isDirectory()) { visit(path); continue; }
    if (!item.name.endsWith('.md')) continue;
    const text = readFileSync(path, 'utf8');
    for (const [name] of text.matchAll(/@agentfiber\/[a-z-]+/g)) {
      if (!packages.has(name)) throw new Error(`Undocumented package ${name} in ${path}`);
    }
    for (const [, link] of text.matchAll(/\]\(([^)]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(link)) continue;
      const target = resolve(dirname(path), link.split('#')[0]);
      if (!target.startsWith(root + '/') || !existsSync(target)) throw new Error(`Broken or external relative link ${link} in ${path}`);
    }
  }
}
visit(root);
console.log('Documentation references only included AgentFiber packages; relative links resolve.');
