import { homeEstimate, formatNumber, formatRange, targetMessage, targetDetail } from './phone-charging-panel.mjs';

const power = document.getElementById('home-power');
const activity = document.getElementById('home-activity');
const resistance = document.getElementById('home-resistance');
function render() {
  const outputWatts = Number(power.value);
  const phoneActivityWatts = Number(activity.value);
  const resistanceMilliOhms = Number(resistance.value);
  const estimate = homeEstimate(outputWatts, phoneActivityWatts, resistanceMilliOhms);
  const { low, base, high } = estimate;
  const values = base.operatingPointFeasible ? {
    gain: formatRange(low.gainPercentagePoints, high.gainPercentagePoints),
    runtime: `${formatRange(low.outputRuntimeMinutes, high.outputRuntimeMinutes)} min`,
    power: `${outputWatts} W`,
    'hero-note': `${resistanceMilliOhms} mΩ assumed cell + wiring resistance; ${phoneActivityWatts} W phone use; 65–90% stored energy. Calculated at a representative 3.8 V. No measured phone output.`,
    'end-charge': `${formatNumber(10 + base.gainPercentagePoints)}%`,
    'baseline-gain': `${formatNumber(base.gainPercentagePoints)} points added in ${formatNumber(base.outputRuntimeMinutes)} minutes.`,
    target: targetMessage(estimate),
    'target-detail': targetDetail(estimate),
    'usb-energy': `${formatRange(low.usbEnergyWh, high.usbEnergyWh)} Wh`,
    current: `${formatNumber(base.batteryCurrentAmps)} A`,
    'c-rate': `${formatNumber(base.dischargeCRate)}C`,
    heat: `${formatNumber(base.totalDeviceLossWatts)} W`,
  } : {
    gain: 'Unavailable', runtime: 'No duration estimate', power: `${outputWatts} W`,
    'hero-note': targetDetail(estimate), 'end-charge': 'Unavailable',
    'baseline-gain': 'No gain estimate for this electrical scenario.',
    target: targetMessage(estimate), 'target-detail': targetDetail(estimate),
    'usb-energy': 'Unavailable', current: 'Unavailable', 'c-rate': 'Unavailable', heat: 'Unavailable',
  };
  for (const [key, value] of Object.entries(values)) {
    for (const element of document.querySelectorAll(`[data-home-value="${key}"]`)) element.textContent = value;
  }
  document.getElementById('home-added-bar').style.width = `${Math.max(0, Math.min(90, base.gainPercentagePoints ?? 0))}%`;
}
if (power && activity && resistance) {
  power.disabled = false;
  activity.disabled = false;
  resistance.disabled = false;
  power.addEventListener('change', render);
  activity.addEventListener('change', render);
  resistance.addEventListener('change', render);
  render();
}
