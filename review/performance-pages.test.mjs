import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { currentVersion, versions, juulReference } from './versions.mjs';
import { calculatePerformance } from './performance-model.mjs';
import { homeEstimate, targetMessage, targetDetail, phonePanelHTML, performanceLabHTML } from './phone-charging-panel.mjs';

test('exported prototype stays tied to the mechanical contract and compact cases remain concepts', async () => {
  const contract = JSON.parse(await readFile(new URL('../mechanical/mechanical-contract.json', import.meta.url), 'utf8'));
  assert.deepEqual(currentVersion.caseDimensions, [contract.dimensions.length, contract.dimensions.width, contract.dimensions.thickness]);
  assert.ok(versions.length >= 3);
  assert.ok(!versions.includes(currentVersion));
  assert.equal(currentVersion.kind, 'current');
  assert.equal(new Set(versions.map(version => version.id)).size, versions.length);
  for (const version of versions) {
    assert.ok(version.caseDimensions.every((dimension, index) => dimension <= currentVersion.caseDimensions[index]));
    assert.ok(version.cellDimensions.every((dimension, index) => dimension < version.caseDimensions[index]));
    assert.ok(version.source.startsWith('https://www.gaoneng.shop/'));
    if (version !== currentVersion) assert.equal(version.kind, 'concept');
  }
  assert.ok(versions[0].cellDimensions[2] > juulReference.dimensions[2] - 1);
});

test('the home never promises ten points when the reference or lower scenario cannot supply them', () => {
  const idle = homeEstimate();
  assert.equal(idle.low.targetReachable, false);
  assert.equal(idle.base.targetReachable, true);
  assert.match(targetDetail(idle), /runs out before/);
  const active = homeEstimate(10, 4);
  assert.equal(active.base.targetReachable, false);
  assert.match(targetMessage(active), /Not enough energy/);
  assert.match(targetDetail(active), /falls short/);
  const small = calculatePerformance({capacityMah: 300, outputWatts: 10, usableEnergyFraction: 1, boostEfficiency: 1, phoneChargingEfficiency: 1});
  assert.equal(small.targetReachable, false);
});

test('home includes useful static estimates and explains the unmeasured range without JavaScript', () => {
  assert.match(phonePanelHTML, /9\.2–12\.7/);
  assert.match(phonePanelHTML, /4\.4–6\.0 min/);
  assert.match(phonePanelHTML, /Not measured/);
  assert.match(performanceLabHTML, /not measured confidence bounds/);
  assert.match(performanceLabHTML, /runs out before \+10 points/);
  assert.match(performanceLabHTML, /16\.76 Wh/);
});


test('home exposes resistance assumption and has explicit cutoff feedback', () => {
  assert.match(performanceLabHTML, /id="home-resistance"/);
  assert.match(phonePanelHTML, /20 mΩ assumed/);
  const cutoff = homeEstimate(25, 0, 80);
  assert.equal(cutoff.base.operatingPointFeasible, false);
  assert.match(targetMessage(cutoff), /unavailable/);
  assert.match(targetDetail(cutoff), /3.2 V cutoff/);
});
