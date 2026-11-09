import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePerformance, estimateRange, PERFORMANCE_ASSUMPTIONS, PERFORMANCE_MODEL_NOTE, USABLE_ENERGY_SCENARIOS } from './performance-model.mjs';

function closeTo(actual, expected) {
  assert.ok(Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * 1e-12, `${actual} differs from ${expected}`);
}

test('zero-resistance baseline tracks conversion losses and phone use in Wh', () => {
  const result = calculatePerformance({ capacityMah: 1000, nominalVoltage: 4, outputWatts: 10, phoneActivityWatts: 1, seriesResistanceOhms: 0 });
  closeTo(result.nameplateEnergyWh, 4);
  closeTo(result.usableCellEnergyWh, 3.2);
  closeTo(result.usbEnergyWh, 2.88);
  closeTo(result.phoneChargeEnergyWh, 2.448);
  closeTo(result.phoneActivityEnergyWh, 0.288);
  closeTo(result.netPhoneEnergyWh, 2.16);
  closeTo(result.gainPercentagePoints, 2.16 / 16.76 * 100);
  closeTo(result.outputRuntimeMinutes, 17.28);
  closeTo(result.netPhoneChargingWatts, 7.5);
  closeTo(result.minutesToDesiredGain, 13.408);
  closeTo(result.batteryCurrentAmps, 10 / (3.8 * 0.9));
  closeTo(result.dischargeCRate, result.batteryCurrentAmps);
  closeTo(result.converterLossWatts, 10 / 9);
  assert.equal(result.targetReachable, true);
});

test('zero resistance preserves idle gain while higher power reduces runtime', () => {
  const slow = calculatePerformance({ capacityMah: 850, outputWatts: 10, seriesResistanceOhms: 0 });
  const fast = calculatePerformance({ capacityMah: 850, outputWatts: 25, seriesResistanceOhms: 0 });
  closeTo(fast.gainPercentagePoints, slow.gainPercentagePoints);
  closeTo(fast.outputRuntimeMinutes, slow.outputRuntimeMinutes * 10 / 25);
  closeTo(fast.minutesToDesiredGain, slow.minutesToDesiredGain * 10 / 25);
  closeTo(fast.batteryCurrentAmps, slow.batteryCurrentAmps * 25 / 10);
  closeTo(fast.dischargeCRate, fast.batteryCurrentAmps / 0.85);
});

test('insufficient cartridge energy makes a desired gain unreachable', () => {
  const result = calculatePerformance({ capacityMah: 550, outputWatts: 25 });
  assert.ok(result.gainPercentagePoints < 10);
  assert.equal(result.targetReachable, false);
  assert.equal(result.minutesToDesiredGain, null);
});

test('phone activity can consume all charging power or drain the phone', () => {
  const balanced = calculatePerformance({ capacityMah: 850, outputWatts: 10, phoneActivityWatts: 8.5 });
  const draining = calculatePerformance({ capacityMah: 850, outputWatts: 10, phoneActivityWatts: 10 });
  closeTo(balanced.netPhoneEnergyWh, 0);
  assert.equal(balanced.minutesToDesiredGain, null);
  assert.ok(draining.gainPercentagePoints < 0);
  assert.equal(draining.targetReachable, false);
  assert.equal(draining.minutesToDesiredGain, null);
});

test('exactly enough energy reaches the target at the end of the output run', () => {
  const options = { capacityMah: 850, outputWatts: 25, phoneActivityWatts: 2 };
  const available = calculatePerformance(options);
  const exact = calculatePerformance({ ...options, desiredGainPercentagePoints: available.gainPercentagePoints });
  assert.equal(exact.targetReachable, true);
  closeTo(exact.minutesToDesiredGain, exact.outputRuntimeMinutes);
  const tooMuch = calculatePerformance({ ...options, desiredGainPercentagePoints: available.gainPercentagePoints + 0.001 });
  assert.equal(tooMuch.targetReachable, false);
});

test('zero usable energy and zero requested gain have explicit results', () => {
  const empty = calculatePerformance({ capacityMah: 850, outputWatts: 25, usableEnergyFraction: 0 });
  assert.equal(empty.outputRuntimeMinutes, 0);
  assert.equal(empty.gainPercentagePoints, 0);
  assert.equal(empty.targetReachable, false);
  assert.equal(empty.minutesToDesiredGain, null);
  const noGainRequested = calculatePerformance({ capacityMah: 850, outputWatts: 25, usableEnergyFraction: 0, desiredGainPercentagePoints: 0 });
  assert.equal(noGainRequested.targetReachable, true);
  assert.equal(noGainRequested.minutesToDesiredGain, 0);
});

test('rounding tolerance cannot create energy for a tiny positive charge target', () => {
  const empty = calculatePerformance({ capacityMah: 850, outputWatts: 25, usableEnergyFraction: 0, desiredGainPercentagePoints: 1e-15 });
  assert.equal(empty.targetReachable, false);
  assert.equal(empty.minutesToDesiredGain, null);
  const tiny = calculatePerformance({ capacityMah: 850, outputWatts: 25, usableEnergyFraction: 1e-18, desiredGainPercentagePoints: 1e-15 });
  assert.ok(tiny.gainPercentagePoints < tiny.inputs.desiredGainPercentagePoints);
  assert.equal(tiny.targetReachable, false);
  assert.equal(tiny.minutesToDesiredGain, null);
});

test('range exposes assumed usable energy fractions and does not change input options', () => {
  const options = Object.freeze({ capacityMah: 850, outputWatts: 25, phoneActivityWatts: 1 });
  const range = estimateRange(options);
  assert.deepEqual(Object.keys(range), ['low', 'base', 'high']);
  for (const [name, fraction] of Object.entries(USABLE_ENERGY_SCENARIOS)) {
    assert.equal(range[name].inputs.usableEnergyFraction, fraction);
    assert.equal(range[name].inputs.phoneActivityWatts, 1);
    closeTo(range[name].nameplateEnergyWh, 3.23);
  }
  assert.ok(range.low.gainPercentagePoints < range.base.gainPercentagePoints);
  assert.ok(range.base.gainPercentagePoints < range.high.gainPercentagePoints);
  assert.equal(range.low.targetReachable, false);
  assert.equal(range.base.targetReachable, true);
  assert.equal(PERFORMANCE_ASSUMPTIONS.phoneBatteryWh, 16.76);
  assert.match(PERFORMANCE_MODEL_NOTE, /not measured performance/);
  assert.match(PERFORMANCE_MODEL_NOTE, /not measured bounds/);
});

test('rejects missing, nonfinite, negative and physically invalid assumptions', () => {
  assert.throws(() => calculatePerformance(), RangeError);
  assert.throws(() => estimateRange(), RangeError);
  const valid = { capacityMah: 850, outputWatts: 25 };
  for (const [name, values] of Object.entries({
    capacityMah: [0, -1, NaN, Infinity, '850'],
    nominalVoltage: [0, -1, NaN],
    outputWatts: [0, -1, Infinity],
    usableEnergyFraction: [-0.1, 1.01, NaN],
    boostEfficiency: [0, -0.1, 1.01, NaN],
    phoneChargingEfficiency: [0, -0.1, 1.01, Infinity],
    phoneActivityWatts: [-1, NaN],
    phoneBatteryWh: [0, -1, Infinity],
    openCircuitVoltage: [0, -1, NaN],
    cutoffVoltage: [0, -1, NaN],
    seriesResistanceOhms: [-1, NaN, Infinity],
    desiredGainPercentagePoints: [-1, 101, NaN],
  })) {
    for (const value of values) assert.throws(() => calculatePerformance({ ...valid, [name]: value }), RangeError, `${name}=${value}`);
  }
  assert.throws(() => calculatePerformance({ capacityMah: 1e308, nominalVoltage: 1e308, outputWatts: 25 }), RangeError);
});

test('perfect efficiencies conserve energy and produce no converter heat', () => {
  const result = calculatePerformance({ capacityMah: 1000, nominalVoltage: 4, outputWatts: 10, usableEnergyFraction: 1, boostEfficiency: 1, phoneChargingEfficiency: 1, seriesResistanceOhms: 0 });
  closeTo(result.nameplateEnergyWh, result.netPhoneEnergyWh);
  assert.equal(result.converterLossWatts, 0);
  closeTo(result.outputRuntimeMinutes, 24);
});


test('resistance model matches an independently solved 2 amp operating point', () => {
  const result = calculatePerformance({ capacityMah: 250, nominalVoltage: 4, usableEnergyFraction: 1,
    openCircuitVoltage: 4, cutoffVoltage: 3.2, seriesResistanceOhms: 0.1, outputWatts: 6.84 });
  closeTo(result.batteryCurrentAmps, 2);
  closeTo(result.loadedCellVoltage, 3.8);
  closeTo(result.resistiveLossWatts, 0.4);
  closeTo(result.cellDepletionWatts, 8);
  closeTo(result.outputRuntimeMinutes, 7.5);
  closeTo(result.usbEnergyWh, 0.855);
});

test('higher output increases resistive heat and reduces idle charge from a 300 mAh cell', () => {
  const slow = calculatePerformance({ capacityMah: 300, outputWatts: 20 });
  const fast = calculatePerformance({ capacityMah: 300, outputWatts: 40 });
  assert.ok(fast.gainPercentagePoints < slow.gainPercentagePoints);
  assert.ok(fast.resistiveLossWatts > 4 * slow.resistiveLossWatts);
  assert.ok(Math.abs(slow.gainPercentagePoints - 4.030437) < 1e-6);
  assert.ok(Math.abs(fast.gainPercentagePoints - 3.888441) < 1e-6);
  assert.ok(Math.abs(fast.resistiveLossWatts - 3.135532) < 1e-6);
});

test('stored cell energy equals USB delivery plus converter and upstream resistance heat', () => {
  for (const resistance of [0, 0.01, 0.02, 0.04]) {
    for (const outputWatts of [10, 20, 40]) {
      const result = calculatePerformance({ capacityMah: 300, outputWatts, seriesResistanceOhms: resistance, phoneActivityWatts: 2 });
      assert.equal(result.operatingPointFeasible, true);
      const hours = result.outputRuntimeMinutes / 60;
      closeTo(result.usableCellEnergyWh, result.usbEnergyWh + result.totalDeviceLossWatts * hours);
      closeTo(result.netPhoneEnergyWh, result.usbEnergyWh * 0.85 - 2 * hours);
      closeTo(result.batteryCurrentAmps * result.loadedCellVoltage, outputWatts / 0.9);
    }
  }
});

test('cutoff and power-limit cases do not fabricate a charge gain or shutdown time', () => {
  for (const [seriesResistanceOhms, outputWatts, reason] of [
    [0.05, 34.56, 'voltage-cutoff'], [0.05, 40, 'voltage-cutoff'], [0.1, 40, 'power-limit'],
  ]) {
    const result = calculatePerformance({ capacityMah: 300, outputWatts, seriesResistanceOhms });
    assert.equal(result.operatingPointFeasible, false);
    assert.equal(result.limitingReason, reason);
    assert.equal(result.gainPercentagePoints, null);
    assert.equal(result.outputRuntimeMinutes, null);
    assert.equal(result.minutesToDesiredGain, null);
    assert.equal(result.usbEnergyWh, null);
  }
  const nearBoundary = calculatePerformance({ capacityMah: 300, outputWatts: 34.55, seriesResistanceOhms: 0.05 });
  assert.equal(nearBoundary.operatingPointFeasible, true);
});
