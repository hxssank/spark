import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { partCatalog } from './part-catalog.mjs';

test('every selectable model part links to its own card or component row', async () => {
  const html = await readFile(new URL('./parts.html', import.meta.url), 'utf8');
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  for (const [name, part] of Object.entries(partCatalog)) {
    assert.ok(ids.has(part.detailId || name), `${name} has no part detail destination`);
    assert.notEqual(part.detailId || name, part.category, `${name} links to a whole category`);
  }
});
