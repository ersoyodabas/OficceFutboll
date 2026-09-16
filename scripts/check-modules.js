import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const files = ['background.js', 'server/server.js'];
for (const dir of ['src', 'shared', 'server/core', 'server/gameplay', 'server/lobby', 'server/network']) {
  for (const file of fs.readdirSync(path.join(root, dir), { recursive: true })) {
    if (file.endsWith('.js')) files.push(path.join(dir, file).replaceAll('\\', '/'));
  }
}
const graph = new Map();
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  const dependencies = [];
  for (const match of read(file).matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) {
    if (!match[1].startsWith('.')) continue;
    const dependency = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
    assert.ok(fs.existsSync(path.join(root, dependency)), `${file}: missing ${dependency}`);
    dependencies.push(dependency);
  }
  graph.set(file, dependencies);
}
const visited = new Set();
function visit(file, stack = []) {
  assert.ok(!stack.includes(file), `Circular import: ${[...stack, file].join(' -> ')}`);
  if (visited.has(file)) return;
  for (const dependency of graph.get(file) || []) visit(dependency, [...stack, file]);
  visited.add(file);
}
for (const file of files) visit(file);

const html = read('game.html');
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  assert.ok(fs.existsSync(path.join(root, match[1])), `Missing entry asset: ${match[1]}`);
}
assert.match(html, /<script type="module" src="src\/core\/game.js"><\/script>/);
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
for (const file of files.filter((f) => f.startsWith('src/'))) {
  for (const match of read(file).matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.has(match[1]), `${file}: missing DOM id ${match[1]}`);
  for (const match of read(file).matchAll(/assetUrl\('([^']+)'\)/g)) assert.ok(fs.existsSync(path.join(root, 'assets', match[1])), `${file}: missing texture ${match[1]}`);
}
const manifest = JSON.parse(read('manifest.json'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.content_security_policy.extension_pages, "script-src 'self'; object-src 'self'");
for (const file of Object.values(manifest.icons)) assert.ok(fs.existsSync(path.join(root, file)));

// Import factories without constructing browser resources: verifies named exports
// across the actual module graph. Only the vendored-library adapter needs a stub.
globalThis.THREE = {};
for (const file of files) {
  if (['src/core/game.js', 'server/server.js', 'background.js'].includes(file)) continue;
  await import(pathToFileURL(path.join(root, file)).href);
}
delete globalThis.THREE;
console.log(`Checked ${files.length} modules: syntax, imports/exports, no cycles, DOM/asset references and MV3 entrypoint.`);
