import { estimateRange, PERFORMANCE_MODEL_NOTE } from './performance-model.mjs';
import { currentVersion, versions } from './versions.mjs';

export const formatNumber = value => value.toFixed(1);
export const formatRange = (low, high) => `${formatNumber(low)}–${formatNumber(high)}`;
export function homeEstimate(outputWatts = 25, phoneActivityWatts = 0, resistanceMilliOhms = 20) {
  return estimateRange({ capacityMah: currentVersion.capacityMah, nominalVoltage: currentVersion.nominalVoltage, outputWatts, phoneActivityWatts, seriesResistanceOhms: resistanceMilliOhms / 1000 });
}

export function targetMessage(estimate) {
  if (!estimate.base.operatingPointFeasible) return 'This output is unavailable in the selected electrical scenario.';
  if (!estimate.base.targetReachable) return 'Not enough energy for +10 points in the reference scenario.';
  return `About ${formatNumber(estimate.base.minutesToDesiredGain)} minutes to add 10 percentage points.`;
}

export function targetDetail(estimate) {
  if (!estimate.base.operatingPointFeasible) return estimate.base.limitingReason === 'voltage-cutoff'
    ? 'The loaded cell voltage reaches the 3.2 V cutoff. Choose a lower output or resistance assumption.'
    : 'The resistance and representative cell voltage cannot supply the requested constant power.';
  if (!estimate.high.targetReachable) return 'Even the higher-energy scenario falls short. Lower phone use may help; extra output power cannot create more cell energy.';
  if (!estimate.base.targetReachable) return 'Only the higher-energy scenario reaches +10 points. Phone use reduces the energy left to store.';
  if (!estimate.low.targetReachable) return 'The reduced-energy scenario runs out before +10 points. This is not a guaranteed charge amount or time.';
  return 'All three assumed energy scenarios reach this target. Actual phone acceptance and temperature may change the result.';
}

const initial = homeEstimate();
const { low, base, high } = initial;
export const phonePanelHTML = `
<span class="estimate-tag">Calculated scenarios · Not measured</span>
<div class="phone-gain"><span data-home-value="gain">${formatRange(low.gainPercentagePoints, high.gainPercentagePoints)}</span><span aria-hidden="true">%</span><span class="sr-only"> percentage points</span></div>
<p class="metric-label">Estimated added charge · iPhone 18 Pro</p>
<div class="hero-metrics"><div><strong><span data-home-value="runtime" style="font:inherit;color:inherit;margin:0">${formatRange(low.outputRuntimeMinutes, high.outputRuntimeMinutes)} min</span></strong><span>To deliver the estimated gain</span></div><div><strong><span data-home-value="power" style="font:inherit;color:inherit;margin:0">25 W</span></strong><span>Assumed accepted USB power</span></div></div>
<p class="hero-caveat" data-home-value="hero-note">20 mΩ assumed cell + wiring resistance; 65–90% stored cell energy. Calculated at a representative 3.8 V. No measured phone output.</p>`;

export const performanceLabHTML = `
<div class="lab-grid"><div>
  <div class="controls"><label for="home-power">Accepted USB power<select id="home-power" disabled><option value="10">10 W</option><option value="15">15 W</option><option value="25" selected>25 W · Design target</option></select></label><label for="home-activity">Phone power use<select id="home-activity" disabled><option value="0">No phone use · 0 W</option><option value="2">Using 2 W</option><option value="4">Using 4 W</option></select></label><label for="home-resistance">Cell + wiring resistance<select id="home-resistance" disabled><option value="0">0 mΩ · ideal</option><option value="10">10 mΩ · assumed</option><option value="20" selected>20 mΩ · assumed</option><option value="40">40 mΩ · assumed</option><option value="80">80 mΩ · assumed</option></select></label></div>
  <div class="lab-result" aria-live="polite" aria-atomic="true"><span class="estimate-tag">Reference scenario · 80% usable cell energy</span><div class="charge-example"><span class="start-charge">10%</span><span class="arrow" aria-hidden="true">→</span><span data-home-value="end-charge">${formatNumber(10 + base.gainPercentagePoints)}%</span></div><div class="battery-bar" aria-hidden="true"><span class="battery-start"></span><span class="battery-added" id="home-added-bar" style="width:${base.gainPercentagePoints}%"></span></div><p class="charge-example-note">Example starting at 10%. <span data-home-value="baseline-gain">${formatNumber(base.gainPercentagePoints)} points added in ${formatNumber(base.outputRuntimeMinutes)} minutes.</span> The phone may draw less power than selected.</p><p class="target-result"><strong data-home-value="target">${targetMessage(initial)}</strong><span class="target-detail" data-home-value="target-detail">${targetDetail(initial)}</span></p></div>
</div><div><dl class="engineering-results"><div><dt>Energy delivered through USB</dt><dd data-home-value="usb-energy">${formatRange(low.usbEnergyWh, high.usbEnergyWh)} Wh</dd></div><div><dt>Calculated battery current</dt><dd data-home-value="current">${formatNumber(base.batteryCurrentAmps)} A</dd></div><div><dt>Battery discharge demand</dt><dd data-home-value="c-rate">${formatNumber(base.dischargeCRate)}C</dd></div><div><dt>Converter + resistance heat</dt><dd data-home-value="heat">${formatNumber(base.totalDeviceLossWatts)} W</dd></div><div><dt>Measured phone charging</dt><dd>Not tested</dd></div></dl><p class="engineering-note">Higher output raises cell and wiring heat through I²R loss. A phone in use also consumes energy during the charge. The model checks loaded voltage against a 3.2 V cutoff; it does not predict cell temperature.</p><a class="secondary-link" href="parts.html#electronics">Inspect the power design →</a></div></div>
<details class="method" id="estimate-method"><summary>Calculation, assumptions and sources</summary><div class="method-content"><div><p>${PERFORMANCE_MODEL_NOTE}</p><ul><li>850 mAh × 3.8 V = 3.23 Wh nameplate energy.</li><li>Reduced / reference / higher usable energy: 65% / 80% / 90%. These are stored-energy assumptions before modeled resistance losses, not measured confidence bounds.</li><li>Representative open-circuit voltage: 3.8 V. Cell + wiring resistance: 20 mΩ by default, an assumption. Boost conversion: 90%. Phone charging: 85%.</li><li>Current solves I × (3.8 V − I × resistance) = USB watts ÷ 0.90. Runtime = stored energy ÷ (converter input watts + I²R). Gain = net phone energy ÷ 16.76 Wh × 100.</li></ul></div><div><p>The 4.20 V charge target, cutoff reserve, age and storage can reduce available stored energy. Voltage and resistance remain constant in this scenario; it does not model a full discharge curve, temperature throttling or charging taper. The example starts at low charge.</p><p>Apple's separate fast-charge claim uses a 60 W-capable AVS adapter. This proposed 25 W fixed-voltage source does not match that setup. The current model represents an enclosure and a bench converter, with no measured phone output.</p><div class="source-links"><a href="${currentVersion.source}" target="_blank" rel="noopener noreferrer">GNB 850 cell</a><a href="https://www.ifixit.com/News/119329/inside-the-tiny-unfixable-eye-iphone-18-pro-and-pro-max-teardown" target="_blank" rel="noopener noreferrer">iFixit battery teardown</a><a href="https://www.apple.com/ca/iphone-18-pro/specs/" target="_blank" rel="noopener noreferrer">Apple specifications</a><a href="../electronics/power-design.md">Power design</a></div></div></div></details>`;

export const versionLinksHTML = versions.map(version => {
  const estimate = estimateRange({ capacityMah: version.capacityMah, nominalVoltage: version.nominalVoltage, outputWatts: version.evaluationWatts });
  return `<a class="version-row" href="comparison.html#version-${version.id}"><strong>${version.name}</strong><span>${formatRange(estimate.low.gainPercentagePoints, estimate.high.gainPercentagePoints)}% estimated gain →</span><small>${version.caseDimensions.join(' × ')} mm · ${version.kind === 'current' ? 'Current fit CAD' : 'Proposed case target'} · ${version.evaluationWatts} W evaluation target</small></a>`;
}).join('');
