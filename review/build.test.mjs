import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, copyFile, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const review = dirname(fileURLToPath(import.meta.url));
const project = dirname(review);
const outputNames = ['parts.html', 'comparison.html', 'index.html', 'part-catalog.mjs', 'build-report.json'];

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'spark-review-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(review, join(root, 'review'), { recursive: true,
    filter: path => !['node_modules', ...outputNames].includes(basename(path))
      && !basename(path).startsWith('.') && !path.endsWith('.test.mjs') });
  await symlink(join(review, 'node_modules'), join(root, 'review/node_modules'), 'dir');
  for (const path of [
    'mechanical/mechanical-contract.json', 'mechanical/exports/geometry-report.json',
    'mechanical/exports/spark_assembly.glb', 'electronics/boost-prototype/component-placement.json',
    'electronics/boost-prototype/circuit.json',
    'electronics/compact-design/layout.json',
  ]) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await copyFile(join(project, path), join(root, path));
  }
  for (const name of outputNames) await writeFile(join(root, 'review', name), `Previous ${name}\n`);
  return root;
}

function build(root) {
  return spawnSync(process.execPath, ['build.mjs'], { cwd: join(root, 'review'), encoding: 'utf8', timeout: 30000 });
}

async function assertUnchanged(root) {
  for (const name of outputNames) assert.equal(await readFile(join(root, 'review', name), 'utf8'), `Previous ${name}\n`);
}

test('a late template failure preserves every existing review deliverable', async t => {
  const root = await fixture(t);
  await appendFile(join(root, 'review/template.html'), '\n__UNFILLED_FIELD__\n');
  const result = build(root);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Unfilled viewer template field/);
  await assertUnchanged(root);
});

test('a successful build uses the new catalog and records all source and output hashes', async t => {
  const root = await fixture(t);
  await rm(join(root, 'review/part-catalog.mjs'));
  await mkdir(join(root, 'review/helpers'));
  await writeFile(join(root, 'review/helpers/future-viewer-helper.mjs'), 'export const buildMarker = "new helper";\n');
  await appendFile(join(root, 'review/viewer.js'), '\nimport { buildMarker } from "./helpers/future-viewer-helper.mjs";\nconsole.log(buildMarker);\n');
  const result = build(root);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(await readFile(join(root, 'review/build-report.json')));
  assert.ok(report.inputs['review/helpers/future-viewer-helper.mjs']);
  assert.ok(report.inputs['electronics/compact-design/layout.json']);
  assert.deepEqual(Object.keys(report.output).sort(), outputNames.filter(name => name !== 'build-report.json').map(name => `review/${name}`).sort());
  for (const section of ['inputs', 'output']) {
    for (const [path, expected] of Object.entries(report[section])) {
      const actual = createHash('sha256').update(await readFile(join(root, path))).digest('hex');
      assert.equal(actual, expected, `${section}: ${path}`);
    }
  }
  assert.match(await readFile(join(root, 'review/index.html'), 'utf8'), /new helper/);
});

test('source changes during compilation cannot certify mixed review outputs', async t => {
  const root = await fixture(t);
  await appendFile(join(root, 'review/parts-page.build.mjs'), `
const fs = await import('node:fs/promises');
await fs.appendFile(new URL('./versions.mjs', import.meta.url), '\\n// Concurrent edit\\n');
`);
  const result = build(root);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Review sources changed during the build/);
  await assertUnchanged(root);
});
