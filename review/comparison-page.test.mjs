import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { versions, juulReference } from './versions.mjs';
import { WATTAGE_OPTIONS, DRAWING_UNITS_PER_MM, cellDemandFor, comparisonStatus, performanceFor, renderPerformance, renderScaleComparison, initializeSizeComparison, renderVersionCard, renderWattageRows } from './comparison-page.mjs';

const plainText = html => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * 1e-12,
  `${actual} differs from ${expected}`);

test('cards pair charge and runtime and suppress unreachable 10-point times', () => {
  for (const version of versions) {
    for (const output of ['targets', ...WATTAGE_OPTIONS]) {
      for (const activity of [0, 2, 4]) {
        const { base } = performanceFor(version, output, activity);
        const html = renderPerformance(version, output, activity);
        const text = plainText(html);
        if (cellDemandFor(version, base).exceedsLabel) {
          assert.match(text, /Above 60C cell label/);
          assert.doesNotMatch(html, /charge-time|target-time|\+\d[\d.]*%/);
          continue;
        }
        assert.match(text, /Calculated iPhone charge/);
        assert.ok(text.includes(`+${base.gainPercentagePoints.toFixed(1)}%`));
        assert.ok(text.includes(`in ${base.outputRuntimeMinutes.toFixed(1)} min`));
        assert.equal(html.includes('<b>Not reached</b>'), !base.targetReachable);
        assert.ok(!/NaN|undefined|null|Infinity/.test(html));
      }
    }
  }
});

test('compact cards keep sourced cell and electrical details collapsed', () => {
  for (const version of versions) {
    const html = renderVersionCard(version);
    assert.match(html, /Calculated iPhone charge/);
    assert.match(html, /<details class="result-details"><summary>Energy and electrical demand/);
    assert.match(html, /<details class="fit-details"><summary>Cell and fit details/);
    assert.match(html, /Cell mass only/);
    assert.match(html, /Finished mass unknown/);
    assert.ok(html.includes(`${version.cellMassGrams.toFixed(1)} ± ${version.cellMassToleranceGrams.toFixed(1)}`));
    assert.ok(html.includes(version.kind === 'current' ? 'Fit CAD' : 'Compact target'));
    assert.ok(html.includes(version.source));
  }
});

test('resistance lowers idle gain as output increases; the zero-resistance baseline conserves it', () => {
  assert.deepEqual(WATTAGE_OPTIONS, [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
  for (const version of versions) {
    let previous = Infinity;
    const ideal = performanceFor(version, 20, 0, 0).base;
    for (const watts of WATTAGE_OPTIONS) {
      const { base } = performanceFor(version, watts);
      assert.ok(base.gainPercentagePoints < previous);
      previous = base.gainPercentagePoints;
      closeTo(base.usbEnergyWh, base.outputRuntimeMinutes / 60 * watts);
      const zeroResistance = performanceFor(version, watts, 0, 0).base;
      closeTo(zeroResistance.gainPercentagePoints, ideal.gainPercentagePoints);
      closeTo(zeroResistance.outputRuntimeMinutes, ideal.outputRuntimeMinutes * 20 / watts);
    }
  }
});

test('phone use subtracts energy for the actual runtime, even when resistance is included', () => {
  for (const version of versions) {
    for (const watts of WATTAGE_OPTIONS) {
      const idle = performanceFor(version, watts, 0).base;
      const active = performanceFor(version, watts, 4).base;
      closeTo(active.outputRuntimeMinutes, idle.outputRuntimeMinutes);
      closeTo(idle.netPhoneEnergyWh - active.netPhoneEnergyWh, 4 * idle.outputRuntimeMinutes / 60);
      assert.ok(active.gainPercentagePoints < idle.gainPercentagePoints);
    }
  }
});

test('wattage matrix displays results from the selected resistance and phone-use scenario', () => {
  for (const resistance of [0, 20, 80]) {
    for (const activity of [0, 2, 4]) {
      const html = renderWattageRows(activity, resistance);
      assert.ok(!/NaN|undefined|null|Infinity/.test(html));
      const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(match => match[1]);
      assert.equal(rows.length, WATTAGE_OPTIONS.length);
      for (const [index, row] of rows.entries()) {
        const watts = WATTAGE_OPTIONS[index];
        const cells = [...row.matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/g)].map(match => plainText(match[1]));
        assert.equal(cells.length, versions.length + 1);
        for (const [versionIndex, version] of versions.entries()) {
          const { base } = performanceFor(version, watts, activity, resistance);
          const cell = cells[versionIndex + 1];
          if (base.operatingPointFeasible && cellDemandFor(version, base).exceedsLabel) {
            assert.match(cell, /Above 60C cell label/);
            assert.match(cell, /Gain and time withheld/);
            assert.doesNotMatch(cell, /\d(?:\.\d)?%|\d(?:\.\d)? min/);
          } else if (base.operatingPointFeasible) {
            assert.ok(cell.includes(`+${base.gainPercentagePoints.toFixed(2)}%`));
            assert.ok(cell.includes(`${base.outputRuntimeMinutes.toFixed(1)} min`));
          } else {
            assert.match(cell, /No gain or runtime estimate/);
            assert.doesNotMatch(cell, /\d(?:\.\d)?%|\d(?:\.\d)? min/);
          }
        }
      }
    }
  }
});

test('case and battery diagrams keep front and side dimensions, offsets and partial overlap', () => {
  const svg = renderScaleComparison();
  for (const [view, dimension] of [['front', 1], ['side', 2]]) {
    const cases = [...svg.matchAll(new RegExp(`<rect class="case-shape scale-(\\d+)" data-case-version="\\d+" data-view="${view}" x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)"`, 'g'))];
    const cells = [...svg.matchAll(new RegExp(`<rect class="cell-shape scale-(\\d+)" data-cell-version="\\d+" data-view="${view}" x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)"`, 'g'))];
    assert.deepEqual(cases.map(match => match[1]), ['850', '530', '300']);
    assert.deepEqual(cells.map(match => match[1]), ['850', '530', '300']);
    for (let index = 0; index < cases.length; index++) {
      const [id, x, y, width, height] = cases[index].slice(1).map((value, i) => i ? Number(value) : value);
      const [, cellX, cellY, cellWidth, cellHeight] = cells[index].slice(1).map((value, i) => i ? Number(value) : value);
      const version = versions.find(item => item.id === id);
      closeTo(width, version.caseDimensions[dimension] * DRAWING_UNITS_PER_MM);
      closeTo(height, version.caseDimensions[0] * DRAWING_UNITS_PER_MM);
      closeTo(cellWidth, version.cellDimensions[dimension] * DRAWING_UNITS_PER_MM);
      closeTo(cellHeight, version.cellDimensions[0] * DRAWING_UNITS_PER_MM);
      closeTo(cellX + cellWidth / 2, x + width / 2);
      closeTo(y + height, 390);
      closeTo(cellY + cellHeight, 390 - version.baseAllowance * DRAWING_UNITS_PER_MM);
      if (index) {
        const previous = cases[index - 1].slice(2).map(Number);
        assert.ok(x > previous[0] && x < previous[0] + previous[2], 'case outlines partly overlap');
      }
    }
    const reference = svg.match(new RegExp(`data-reference-view="${view}" x="[\\d.]+" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)"`));
    assert.ok(reference);
    closeTo(Number(reference[2]), juulReference.dimensions[dimension] * DRAWING_UNITS_PER_MM);
    closeTo(Number(reference[3]), juulReference.dimensions[0] * DRAWING_UNITS_PER_MM);
    closeTo(Number(reference[1]) + Number(reference[3]), 390);
  }
  assert.match(svg, /JUUL 2 reference/);
  assert.match(svg, /Dark(?:er|er areas)/);
  assert.doesNotMatch(svg, /PCB|board/);
});

test('individual view keeps true dimensions and separates complete case and battery outlines', () => {
  const svg = renderScaleComparison('individual');
  for (const [view, dimension] of [['front', 1], ['side', 2]]) {
    const cases = [...svg.matchAll(new RegExp(`<rect class="case-shape scale-(\\d+)" data-case-version="\\d+" data-view="${view}" x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)"`, 'g'))];
    const cells = [...svg.matchAll(new RegExp(`<rect class="cell-shape scale-(\\d+)" data-cell-version="\\d+" data-view="${view}" x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)"`, 'g'))];
    assert.deepEqual(cases.map(match => match[1]), ['850', '530', '300']);
    assert.deepEqual(cells.map(match => match[1]), ['850', '530', '300']);
    for (let i = 0; i < cases.length; i++) {
      const [id, x, , width, height] = cases[i].slice(1).map((value, index) => index ? Number(value) : value);
      const [cellId, cellX, , cellWidth, cellHeight] = cells[i].slice(1).map((value, index) => index ? Number(value) : value);
      const version = versions.find(item => item.id === id);
      assert.equal(cellId, id);
      closeTo(width, version.caseDimensions[dimension] * DRAWING_UNITS_PER_MM);
      closeTo(height, version.caseDimensions[0] * DRAWING_UNITS_PER_MM);
      closeTo(cellWidth, version.cellDimensions[dimension] * DRAWING_UNITS_PER_MM);
      closeTo(cellHeight, version.cellDimensions[0] * DRAWING_UNITS_PER_MM);
      closeTo(cellX + cellWidth / 2, x + width / 2);
      if (i) {
        const previousX = Number(cases[i - 1][2]);
        const previousWidth = Number(cases[i - 1][4]);
        assert.ok(x > previousX + previousWidth, 'case outlines do not overlap');
      }
    }
    const reference = svg.match(new RegExp(`data-reference-view="${view}" x="[\\d.]+" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)"`));
    assert.ok(reference);
    closeTo(Number(reference[2]), juulReference.dimensions[dimension] * DRAWING_UNITS_PER_MM);
    closeTo(Number(reference[3]), juulReference.dimensions[0] * DRAWING_UNITS_PER_MM);
  }
  assert.throws(() => renderScaleComparison('invalid'), /Unknown comparison mode/);
});

test('view selector renders each requested scale comparison', () => {
  let change;
  const select = { disabled: true, value: 'individual', addEventListener(name, handler) { assert.equal(name, 'change'); change = handler; } };
  const drawing = { innerHTML: '' };
  initializeSizeComparison({ querySelector: selector => selector === '#size-view' ? select : drawing });
  assert.equal(select.disabled, false);
  change();
  assert.match(drawing.innerHTML, /Cases are separated/);
  select.value = 'overlap';
  change();
  assert.match(drawing.innerHTML, /Cases partially overlap/);
});

test('cutoff cards use an explicit state and keep gain/time absent', () => {
  const html = renderPerformance(versions[0], 40, 0, 80);
  assert.match(html, /Below voltage cutoff/);
  assert.doesNotMatch(html, /charge-time|target-time|\+\d[\d.]*%/);
  assert.match(comparisonStatus('20', 2, 40), /40 mΩ assumed for each size/);
});

test('comparison removes the warning banner and keeps the resistance assumption visible', async () => {
  const template = await readFile(new URL('./comparison-page.template.html', import.meta.url), 'utf8');
  assert.match(template, /<h1 id="page-title">Compare sizes<\/h1>/);
  assert.doesNotMatch(template, /__COMPACT_DESIGN__|compact-design|Battery and PCB space/);
  assert.match(template, /Case and battery sizes/);
  assert.match(template, /Charging speeds/);
  assert.ok(template.indexOf('__SCALE_COMPARISON__') < template.indexOf('__VERSION_CARDS__'));
  assert.match(template, /<details class="scenario-options">/);
  assert.match(template, /Cell \+ wiring resistance/);
  assert.match(template, /Same assumption for every size; not measured cell data/);
  assert.match(template, /0 mΩ · ideal baseline/);
  assert.doesNotMatch(template, /power-limit|hero-note|How small can|final percentage stays the same/);
});


test('cell label screening checks demand near cutoff rather than only at representative voltage', () => {
  const small = versions[0];
  const at50 = cellDemandFor(small, performanceFor(small, 50).base);
  const at55 = cellDemandFor(small, performanceFor(small, 55).base);
  const at60 = cellDemandFor(small, performanceFor(small, 60).base);
  assert.equal(at50.exceedsLabel, false);
  assert.ok(performanceFor(small, 55).base.dischargeCRate < 60);
  assert.equal(at55.exceedsLabel, true);
  assert.equal(at60.exceedsLabel, true);
  closeTo(at60.currentAtCutoff, 60 / .9 / 3.2);
  closeTo(at60.cRateAtCutoff, 69.44444444444444);
  for (const version of versions.slice(1)) assert.equal(cellDemandFor(version, performanceFor(version, 60).base).exceedsLabel, false);
});
