import test from 'node:test';
import assert from 'node:assert/strict';
import compactLayout from '../electronics/compact-design/layout.json' with { type: 'json' };
import { versions, currentVersion } from './versions.mjs';
import { compactVersion, lengthAllocation, renderBoard, renderStack, renderCompactVersion, compactDesignHTML, initializeCompactDesign } from './compact-layout.mjs';

const plainText = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

test('compact case lengths come from actual allocations and keep source cell envelopes', () => {
  assert.deepEqual(versions.map(version => version.cellDimensions), [[51, 11.5, 6.7], [59, 17.5, 6.5], [66, 18, 7.7]]);
  for (const version of versions) {
    const layout = compactVersion(version.id);
    assert.deepEqual(version.caseDimensions, layout.caseMm);
    assert.deepEqual(version.previousCaseDimensions, layout.previousCaseMm);
    assert.deepEqual(version.boardDimensions, layout.boardMm);
    assert.deepEqual(version.cellDimensions, layout.cellMm);
    assert.equal(version.baseAllowance, layout.baseMm);
    assert.equal(lengthAllocation(layout).reduce((sum, bay) => sum + bay.length, 0), layout.caseMm[0]);
    assert.equal(layout.previousCaseMm[0] - layout.cellMm[0], 50);
    assert.equal(version.kind, 'concept');
  }
  assert.deepEqual(versions.map(version => version.caseDimensions[0]), [80, 88, 99]);
  assert.deepEqual(versions.map(version => version.caseDimensions[0] - version.cellDimensions[0]), [29, 29, 33]);
  assert.deepEqual(currentVersion.caseDimensions, [116, 24, 14.8]);
  assert.throws(() => lengthAllocation({ ...compactVersion('300'), caseMm: [79, 20, 11] }), /Length allocation differs/);
  assert.throws(() => compactVersion('999'), /Unknown compact version/);
});

test('both board faces render each source reservation with its exact dimensions and side', () => {
  for (const version of compactLayout.versions) {
    for (const side of ['front', 'back']) {
      const html = renderBoard(version, side);
      const shown = version.components.filter(component => component.side === side || component.side === 'both');
      assert.equal((html.match(/data-packing-ref=/g) ?? []).length, shown.length);
      for (const component of shown) {
        assert.ok(html.includes(`data-packing-ref="${component.reference}"`));
        assert.ok(html.includes(`data-bounds-mm="${component.boundsMm.join(',')}"`));
        const [x0, y0, x1, y1] = component.boundsMm;
        assert.ok(html.includes(`x="${x0}" y="${version.boardMm[1] - y1}" width="${x1 - x0}" height="${y1 - y0}"`));
      }
      assert.match(html, /Unrouted placement study/);
      assert.doesNotMatch(html, /<path|<line|copper-trace/);
    }
    const stack = renderStack(version);
    assert.match(stack, /stack-board/);
    assert.match(stack, /stack-display/);
    assert.match(stack, /stack-lens/);
  }
});

test('placement preview separates target dimensions from exported prototype and circuit qualification', () => {
  for (const version of compactLayout.versions) {
    const html = renderCompactVersion(version);
    const text = plainText(html);
    assert.ok(html.includes(`../mechanical/compact-exports/spark_${version.id}_packing.step`));
    assert.match(text, /Case length beyond the cell/);
    assert.match(text, /case target/);
    assert.match(text, /No copper routing or manufactured footprints/);
    assert.match(text, /Series wiring reduces capacitance/);
    assert.match(text, /cell cutoff, short-circuit protection and temperature sensing/);
    assert.ok(!/NaN|undefined|null|Infinity/.test(text));
  }
  assert.match(compactDesignHTML, /id="compact-design"/);
  assert.match(compactDesignHTML, /value="850" selected/);
  assert.match(compactDesignHTML, /data-compact-version="850"/);
});

test('layout selector switches the complete diagram while preserving expanded details', () => {
  let change;
  const detail = { open: true };
  const selector = { disabled: true, value: '300', addEventListener: (name, callback) => { assert.equal(name, 'change'); change = callback; } };
  const content = { innerHTML: '', querySelector: () => detail };
  const root = { querySelector: query => query === '#compact-version' ? selector : content };
  initializeCompactDesign(root);
  assert.equal(selector.disabled, false);
  change();
  assert.match(content.innerHTML, /data-compact-version="300"/);
  assert.match(content.innerHTML, /50 → 29/);
  assert.equal(detail.open, true);
  selector.value = '530';
  change();
  assert.match(content.innerHTML, /data-compact-version="530"/);
  initializeCompactDesign({ querySelector: () => null });
});
