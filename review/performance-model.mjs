export const USABLE_ENERGY_SCENARIOS = Object.freeze({ low: 0.65, base: 0.80, high: 0.90 });
export const PHONE_BATTERY_WH = 16.76;

export const PERFORMANCE_ASSUMPTIONS = Object.freeze({
  nominalVoltage: 3.8,
  usableEnergyFraction: USABLE_ENERGY_SCENARIOS.base,
  boostEfficiency: 0.90,
  phoneChargingEfficiency: 0.85,
  phoneActivityWatts: 0,
  phoneBatteryWh: PHONE_BATTERY_WH,
  openCircuitVoltage: 3.8,
  cutoffVoltage: 3.2,
  seriesResistanceOhms: 0.020,
  desiredGainPercentagePoints: 10,
});

export const PERFORMANCE_MODEL_NOTE = 'Calculated scenario, not measured performance. The model holds open-circuit voltage, cell-plus-wiring resistance and conversion efficiencies constant. Usable energy fractions describe available stored energy before modeled resistance losses, accounting for reduced charge voltage, cutoff reserve and aging; they are not measured bounds. It includes resistive heat and loaded-voltage cutoff at this representative operating point. It does not predict temperature, a full discharge-voltage curve, charging taper or thermal shutdown.';

function validateInputs(inputs) {
  for (const [name, value] of Object.entries(inputs)) {
    if (!Number.isFinite(value)) throw new RangeError(`${name} must be a finite number.`);
  }
  for (const name of ['capacityMah', 'nominalVoltage', 'outputWatts', 'phoneBatteryWh', 'openCircuitVoltage', 'cutoffVoltage']) {
    if (inputs[name] <= 0) throw new RangeError(`${name} must be greater than zero.`);
  }
  for (const name of ['boostEfficiency', 'phoneChargingEfficiency']) {
    if (inputs[name] <= 0 || inputs[name] > 1) throw new RangeError(`${name} must be greater than zero and at most one.`);
  }
  if (inputs.seriesResistanceOhms < 0) throw new RangeError('seriesResistanceOhms cannot be negative.');
  if (inputs.usableEnergyFraction < 0 || inputs.usableEnergyFraction > 1) throw new RangeError('usableEnergyFraction must be between zero and one.');
  if (inputs.phoneActivityWatts < 0) throw new RangeError('phoneActivityWatts cannot be negative.');
  if (inputs.desiredGainPercentagePoints < 0 || inputs.desiredGainPercentagePoints > 100) throw new RangeError('desiredGainPercentagePoints must be between zero and 100.');
}

export function calculatePerformance({
  capacityMah,
  outputWatts,
  nominalVoltage = PERFORMANCE_ASSUMPTIONS.nominalVoltage,
  usableEnergyFraction = PERFORMANCE_ASSUMPTIONS.usableEnergyFraction,
  boostEfficiency = PERFORMANCE_ASSUMPTIONS.boostEfficiency,
  phoneChargingEfficiency = PERFORMANCE_ASSUMPTIONS.phoneChargingEfficiency,
  phoneActivityWatts = PERFORMANCE_ASSUMPTIONS.phoneActivityWatts,
  phoneBatteryWh = PERFORMANCE_ASSUMPTIONS.phoneBatteryWh,
  openCircuitVoltage = PERFORMANCE_ASSUMPTIONS.openCircuitVoltage,
  cutoffVoltage = PERFORMANCE_ASSUMPTIONS.cutoffVoltage,
  seriesResistanceOhms = PERFORMANCE_ASSUMPTIONS.seriesResistanceOhms,
  desiredGainPercentagePoints = PERFORMANCE_ASSUMPTIONS.desiredGainPercentagePoints,
} = {}) {
  const inputs = {
    capacityMah, outputWatts, nominalVoltage, usableEnergyFraction, boostEfficiency,
    phoneChargingEfficiency, phoneActivityWatts, phoneBatteryWh, openCircuitVoltage,
    cutoffVoltage, seriesResistanceOhms, desiredGainPercentagePoints,
  };
  validateInputs(inputs);
  const nameplateEnergyWh = capacityMah / 1000 * nominalVoltage;
  const usableCellEnergyWh = nameplateEnergyWh * usableEnergyFraction;
  const converterInputWatts = outputWatts / boostEfficiency;
  const discriminant = openCircuitVoltage ** 2 - 4 * seriesResistanceOhms * converterInputWatts;
  const converterLossWatts = converterInputWatts - outputWatts;
  const desiredPhoneEnergyWh = phoneBatteryWh * desiredGainPercentagePoints / 100;
  if (![nameplateEnergyWh, usableCellEnergyWh, converterInputWatts, discriminant, desiredPhoneEnergyWh].every(Number.isFinite)) {
    throw new RangeError('Inputs exceed the numerical range of this model.');
  }
  const batteryCurrentAmps = discriminant < 0 ? null
    : 2 * converterInputWatts / (openCircuitVoltage + Math.sqrt(discriminant));
  const loadedCellVoltage = batteryCurrentAmps === null ? null : openCircuitVoltage - batteryCurrentAmps * seriesResistanceOhms;
  const resistiveLossWatts = batteryCurrentAmps === null ? null : batteryCurrentAmps ** 2 * seriesResistanceOhms;
  const limitingReason = discriminant < 0 ? 'power-limit' : loadedCellVoltage <= cutoffVoltage + 1e-12 ? 'voltage-cutoff' : null;
  const electrical = {
    batteryCurrentAmps, loadedCellVoltage, resistiveLossWatts, converterLossWatts,
    totalDeviceLossWatts: resistiveLossWatts === null ? null : resistiveLossWatts + converterLossWatts,
    dischargeCRate: batteryCurrentAmps === null ? null : batteryCurrentAmps / (capacityMah / 1000),
  };
  if (Object.values(electrical).some(value => value !== null && !Number.isFinite(value))) throw new RangeError('Inputs exceed the numerical range of this model.');
  if (limitingReason) {
    return {
      inputs, nameplateEnergyWh, usableCellEnergyWh, desiredPhoneEnergyWh, ...electrical,
      operatingPointFeasible: false, limitingReason, targetReachable: false,
      minutesToDesiredGain: null, gainPercentagePoints: null, outputRuntimeMinutes: null,
      usbEnergyWh: null, phoneChargeEnergyWh: null, phoneActivityEnergyWh: null,
      netPhoneEnergyWh: null, netPhoneChargingWatts: null, cellDepletionWatts: null,
    };
  }
  const cellDepletionWatts = converterInputWatts + resistiveLossWatts;
  const outputRuntimeHours = usableCellEnergyWh / cellDepletionWatts;
  const usbEnergyWh = outputWatts * outputRuntimeHours;
  const phoneChargeEnergyWh = usbEnergyWh * phoneChargingEfficiency;
  const phoneActivityEnergyWh = phoneActivityWatts * outputRuntimeHours;
  const netPhoneEnergyWh = phoneChargeEnergyWh - phoneActivityEnergyWh;
  const netPhoneChargingWatts = outputWatts * phoneChargingEfficiency - phoneActivityWatts;
  const results = {
    nameplateEnergyWh, usableCellEnergyWh, usbEnergyWh, phoneChargeEnergyWh,
    phoneActivityEnergyWh, netPhoneEnergyWh, netPhoneChargingWatts, desiredPhoneEnergyWh,
    cellDepletionWatts, ...electrical,
    gainPercentagePoints: netPhoneEnergyWh / phoneBatteryWh * 100,
    outputRuntimeMinutes: outputRuntimeHours * 60,
  };
  if (Object.values(results).some(value => !Number.isFinite(value))) throw new RangeError('Inputs exceed the numerical range of this model.');
  const energyTolerance = Math.max(Math.abs(netPhoneEnergyWh), desiredPhoneEnergyWh) * Number.EPSILON * 8;
  const targetReachable = desiredGainPercentagePoints === 0
    || (netPhoneChargingWatts > 0 && netPhoneEnergyWh > 0
        && netPhoneEnergyWh + energyTolerance >= desiredPhoneEnergyWh);
  const minutesToDesiredGain = desiredGainPercentagePoints === 0 ? 0
    : targetReachable ? Math.min(results.outputRuntimeMinutes, desiredPhoneEnergyWh / netPhoneChargingWatts * 60) : null;
  return { inputs, ...results, operatingPointFeasible: true, limitingReason: null, targetReachable, minutesToDesiredGain };
}

export function estimateRange(options = {}) {
  return Object.fromEntries(Object.entries(USABLE_ENERGY_SCENARIOS).map(([name, usableEnergyFraction]) => [
    name, calculatePerformance({ ...options, usableEnergyFraction }),
  ]));
}
