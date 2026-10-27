// Static checks on the generated ./deploy artifact. Local file work only.
// Set VERIFY_CLEAN_INSTALL=1 to also install the generated package.json into a
// scratch copy (offline) and load the entry there.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deploy = join(appDir, 'deploy');
const bundle = readFileSync(join(deploy, 'index.js'), 'utf8');
const pkg = JSON.parse(readFileSync(join(deploy, 'package.json'), 'utf8'));
const source = readFileSync(join(appDir, 'src/index.ts'), 'utf8');
const sourcePkg = JSON.parse(
  readFileSync(join(appDir, 'package.json'), 'utf8'),
);
const builtins = new Set(builtinModules);
const failures = [];

if (/@paldora\//.test(bundle))
  failures.push('bundle still references @paldora/*');
if (pkg.main !== 'index.js')
  failures.push('package.json main must be index.js');
if (pkg.engines?.node !== sourcePkg.engines.node)
  failures.push('engines.node differs from the source package');
if (pkg.devDependencies) failures.push('devDependencies must not be present');
for (const [name, version] of Object.entries(pkg.dependencies))
  if (!/^\d+\.\d+\.\d+$/.test(version) || version.startsWith('workspace:'))
    failures.push(`${name} is not an exact version: ${version}`);

// esbuild's own import scan (no bundling) avoids false hits in string literals.
const scan = await build({
  entryPoints: [join(deploy, 'index.js')],
  bundle: false,
  write: false,
  metafile: true,
  format: 'esm',
  logLevel: 'silent',
});
const imported = new Set();
for (const output of Object.values(scan.metafile.outputs))
  for (const { path } of output.imports) {
    if (path.startsWith('node:') || builtins.has(path)) continue;
    const parts = path.split('/');
    imported.add(path.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]);
  }
for (const name of imported)
  if (!pkg.dependencies[name])
    failures.push(`bundle imports ${name} but package.json does not list it`);
for (const name of Object.keys(pkg.dependencies))
  if (!imported.has(name))
    failures.push(`package.json lists ${name} but the bundle never imports it`);

const exportedNames = [...source.matchAll(/^export const (\w+)\s*=/gm)].map(
  (m) => m[1],
);
if (exportedNames.length < 50)
  failures.push(`only ${exportedNames.length} exports found in source`);

async function loadEntry(dir) {
  process.env.GCLOUD_PROJECT ??= 'demo-paldora';
  return import(pathToFileURL(join(dir, 'index.js')).href);
}

let loadDir = deploy;
let scratch = null;
if (process.env.VERIFY_CLEAN_INSTALL === '1') {
  scratch = mkdtempSync(join(tmpdir(), 'paldora-functions-clean-'));
  cpSync(deploy, scratch, {
    recursive: true,
    filter: (path) => !path.includes('node_modules'),
  });
  const install = spawnSync(
    'npm',
    ['install', '--offline', '--no-audit', '--no-fund', '--ignore-scripts'],
    { cwd: scratch, stdio: 'inherit' },
  );
  if (install.status !== 0) failures.push('clean offline npm install failed');
  loadDir = scratch;
}
if (failures.length === 0) {
  const module = await loadEntry(loadDir);
  for (const name of exportedNames)
    if (module[name] === undefined)
      failures.push(`bundle does not export ${name}`);
  for (const name of Object.keys(module))
    if (!exportedNames.includes(name))
      failures.push(`bundle exports unexpected ${name}`);
}
if (scratch) rmSync(scratch, { recursive: true, force: true });

if (failures.length > 0) {
  process.stderr.write(
    `Bundle check failed:\n${failures.map((f) => `- ${f}`).join('\n')}\n`,
  );
  process.exit(1);
}
process.stdout.write(
  `Bundle check passed (${exportedNames.length} exports, externals: ${Object.keys(pkg.dependencies).join(', ')}).\n`,
);
