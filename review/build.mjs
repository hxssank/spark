import { mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const hash = data => createHash('sha256').update(data).digest('hex');
const engineeringInputs = [
  'mechanical/exports/spark_assembly.glb', 'mechanical/mechanical-contract.json',
  'mechanical/exports/geometry-report.json', 'electronics/boost-prototype/component-placement.json',
  'electronics/boost-prototype/circuit.json',
  'electronics/compact-design/layout.json',
];

async function sourcePaths(directory = 'review') {
  const paths = [];
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    const name = entry.name;
    if (name.startsWith('.') || ['node_modules', '__pycache__'].includes(name) || name.endsWith('-backups')) continue;
    const path = `${directory}/${name}`;
    if (entry.isDirectory()) paths.push(...await sourcePaths(path));
    else if ((/\.(?:m?js)$/.test(name) && !name.endsWith('.test.mjs') && path !== 'review/part-catalog.mjs')
      || name === 'template.html' || name.endsWith('.template.html')
      || name === 'package.json' || name === 'package-lock.json') paths.push(path);
  }
  return paths;
}

async function readInputs() {
  return Object.fromEntries(await Promise.all([...await sourcePaths(), ...engineeringInputs]
    .sort().map(async path => [path, await readFile(resolve(root, path))])));
}

const originalInputs = await readInputs();
const { buildPartsPage } = await import('./parts-page.build.mjs');
const { buildComparisonPage } = await import('./comparison-page.build.mjs');
const { phonePanelHTML, performanceLabHTML, versionLinksHTML } = await import('./phone-charging-panel.mjs');
const outputs = { ...await buildPartsPage(), ...await buildComparisonPage() };
const performance = await build({
  absWorkingDir: root, entryPoints: [resolve(here, 'home-performance.mjs')],
  bundle: true, minify: true, format: 'iife', target: ['es2020'], write: false,
});
const result = await build({
  absWorkingDir: root,
  entryPoints: [resolve(here, 'viewer.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  legalComments: 'inline',
  write: false,
  plugins: [{
    name: 'generated-part-catalog',
    setup(builder) {
      builder.onResolve({ filter: /^\.\/part-catalog\.mjs$/ }, () => ({ path: resolve(here, 'part-catalog.mjs') }));
      builder.onLoad({ filter: /[/\\]part-catalog\.mjs$/ }, () => ({
        contents: outputs['review/part-catalog.mjs'], loader: 'js', resolveDir: here,
      }));
    },
  }],
});
const glb = originalInputs['mechanical/exports/spark_assembly.glb'];
const contract = JSON.parse(originalInputs['mechanical/mechanical-contract.json']);
let template = originalInputs['review/template.html'].toString();
const format = values => values.map(value => Number(value.toFixed(2))).join(' × ');
const fields = {
  '__PHONE_PANEL__': phonePanelHTML,
  '__PERFORMANCE_LAB__': performanceLabHTML,
  '__VERSION_LINKS__': versionLinksHTML,
  '__PERFORMANCE_BUNDLE__': performance.outputFiles[0].text.replaceAll('</script', '<\\/script'),
  '__ENCLOSURE__': format([contract.dimensions.length, contract.dimensions.width, contract.dimensions.thickness]),
  '__CELL_LENGTH__': format([contract.cell.envelope[2]]),
  '__PCB_LENGTH__': format([contract.pcb.length]),
};
for (const [key, value] of Object.entries(fields)) template = template.replaceAll(key, () => value);
const script = result.outputFiles[0].text.replaceAll('</script', '<\\/script');
const html = template.replace('__GLB_BASE64__', () => glb.toString('base64')).replace('__VIEWER_BUNDLE__', () => script);
if (/__[A-Z_]+__/.test(template.replace('__GLB_BASE64__', '').replace('__VIEWER_BUNDLE__', ''))) throw new Error('Unfilled viewer template field.');
outputs['review/index.html'] = html;

const currentInputs = await readInputs();
if (JSON.stringify(Object.keys(currentInputs)) !== JSON.stringify(Object.keys(originalInputs))
  || Object.entries(originalInputs).some(([path, data]) => !data.equals(currentInputs[path]))) {
  throw new Error('Review sources changed during the build. Retry after edits finish.');
}
const inputs = Object.fromEntries(Object.entries(originalInputs).map(([path, data]) => [path, hash(data)]));
inputs['review/part-catalog.mjs'] = hash(outputs['review/part-catalog.mjs']);
outputs['review/build-report.json'] = JSON.stringify({
  inputs,
  output: Object.fromEntries(Object.entries(outputs).map(([path, data]) => [path, hash(data)])),
}, null, 2) + '\n';

const staging = await mkdtemp(resolve(here, '.build-'));
const previous = new Map();
const published = [];
try {
  for (const [path, data] of Object.entries(outputs)) {
    await writeFile(resolve(staging, basename(path)), data);
    try { previous.set(path, await readFile(resolve(root, path))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const path of Object.keys(outputs)) {
    await rename(resolve(staging, basename(path)), resolve(root, path));
    published.push(path);
  }
} catch (error) {
  for (const path of published.reverse()) {
    if (previous.has(path)) await writeFile(resolve(root, path), previous.get(path));
    else await rm(resolve(root, path));
  }
  throw error;
} finally {
  await rm(staging, { recursive: true, force: true });
}
console.log(JSON.stringify({ files: Object.keys(outputs), bytes: Buffer.byteLength(html), modelBytes: glb.length }));
