import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASSEMBLY_STEPS, assemblyPose, lengthDescription, lengthExplorerHTML, powerMode } from './parts-motion.mjs';

const contract = JSON.parse(readFileSync(new URL('../mechanical/mechanical-contract.json', import.meta.url)));

test('the removal sequence separates the cap before sleeve and leaves later parts seated', () => {
  assert.equal(ASSEMBLY_STEPS.length, 6);
  assert.deepEqual(assemblyPose(0), { cap: [0, 0], sleeve: [-0, 0], cover: [0, 0], cell: [0, 0], board: [0, -0] });
  for (const value of [0.25, 0.75, 1]) {
    const pose = assemblyPose(value);
    assert.deepEqual(pose.sleeve, [-0, 0]);
    assert.deepEqual(pose.cover, [0, 0]);
  }
  assert.deepEqual(assemblyPose(2).cell, [0, 0]);
  assert.deepEqual(assemblyPose(3).board, [0, -0]);
  assert.equal(assemblyPose(5).cell[0], 190);
  assert.equal(assemblyPose(5).board[0], 100);
  assert.deepEqual(assemblyPose(50), assemblyPose(5));
  assert.throws(() => assemblyPose(NaN), /finite/);
});

test('the illustrated sleeve clears the carrier before moving aside and returning upward', () => {
  for (let step = 1; step < 2; step += 0.01) {
    const [x, y] = assemblyPose(step).sleeve;
    if (x < -0.001 && x > -159.999) assert.ok(y >= 237.999, `Lateral sleeve movement before full removal at ${step}`);
    if (y < 237.999 && x < -0.001) assert.ok(x <= -159.999);
  }
});

test('phone and charging explanations never treat missing circuits as implemented', () => {
  assert.deepEqual(powerMode('bench').missing, []);
  assert.ok(powerMode('bench').active.includes('boost'));
  assert.ok(powerMode('phone').missing.includes('protection'));
  assert.ok(powerMode('phone').missing.includes('usb-pd'));
  assert.ok(powerMode('recharge').missing.includes('charger'));
  assert.ok(!powerMode('recharge').active.includes('boost'));
  for (const name of ['phone', 'recharge']) {
    const mode = powerMode(name);
    assert.ok(mode.missing.every(node => !mode.active.includes(node)));
  }
  assert.throws(() => powerMode('__proto__'), /Unknown/);
});

test('length exploration uses the generated contract and escapes source labels', () => {
  const leadBay = contract.space_budget.longitudinal_bays.find(bay => bay.label === 'Lead gap');
  assert.match(lengthDescription(leadBay, contract.dimensions.length), /3.5 mm, from 72.5 to 76 mm/);
  assert.match(lengthDescription(leadBay, contract.dimensions.length), /116 mm/);
  const unsafe = structuredClone(contract);
  unsafe.space_budget.longitudinal_bays[0].label = '</script><b>unsafe</b>';
  const html = lengthExplorerHTML(unsafe);
  assert.match(html, /&lt;\/script&gt;/);
  assert.match(html, /\\u003c\/script>/);
  assert.equal((html.match(/<\/script>/g) || []).length, 1);
  assert.throws(() => lengthDescription({ ...leadBay, length_mm: 4 }, 116), /Invalid/);
});
