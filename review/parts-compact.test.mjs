import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPartsPage } from './parts-page.build.mjs';

test('assembly page includes the compact selector and the battery and PCB comparison', async () => {
  const html = (await buildPartsPage())['review/parts.html'];
  assert.match(html, /href="#compact-design"/);
  assert.match(html, /<section class="compact-section" id="compact-design"/);
  assert.match(html, /id="compact-version" disabled/);
  assert.match(html, /data-pcb-version="850"/);
  assert.match(html, /data-cell-version="300"/);
  assert.match(html, /\.compact-section\{/);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script?.includes('#compact-version'));
  assert.ok(script.includes('change'));
});
