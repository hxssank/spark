import { versions, juulReference, sourceCheckedDate } from './versions.mjs';
import { estimateRange, PHONE_BATTERY_WH } from './performance-model.mjs';

const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const number = (value, digits = 1) => Number(value.toFixed(digits)).toLocaleString('en-CA', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const dimensions = values => values.join(' × ');
export const WATTAGE_OPTIONS = Object.freeze([10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);

export function performanceFor(version, output = 'targets', phoneActivityWatts = 0, resistanceMilliOhms = 20) {
  return estimateRange({ capacityMah: version.capacityMah, nominalVoltage: version.nominalVoltage,
    outputWatts: output === 'targets' ? version.evaluationWatts : Number(output), phoneActivityWatts,
    seriesResistanceOhms: resistanceMilliOhms / 1000 });
}

export function powerTargetNote(version, outputWatts) {
  return outputWatts > version.evaluationWatts
    ? `Above this version's ${version.evaluationWatts} W evaluation target.` : `${version.evaluationWatts} W evaluation target.`;
}

export function comparisonStatus(output = 'targets', phoneActivityWatts = 0, resistanceMilliOhms = 20) {
  const power = output === 'targets' ? '10 / 15 / 25 W' : `${output} W each`;
  return `Calculated · ${power} · ${phoneActivityWatts} W phone use · ${resistanceMilliOhms} mΩ assumed for each size`;
}

function gainLabel(value, digits = 1) {
  return `${value > 0 ? '+' : ''}${number(value, digits)}%`;
}

function limitLabel(estimate) {
  return estimate.limitingReason === 'voltage-cutoff' ? 'Below voltage cutoff' : 'No power solution';
}

export function cellDemandFor(version, estimate) {
  const currentAtCutoff = estimate.inputs.outputWatts / estimate.inputs.boostEfficiency / estimate.inputs.cutoffVoltage;
  const cRateAtCutoff = currentAtCutoff / (version.capacityMah / 1000);
  return { currentAtCutoff, cRateAtCutoff, exceedsLabel: cRateAtCutoff > version.dischargeLabelCRate };
}

function cellLimitMarkup(version, demand) {
  return `<strong>Above ${version.dischargeLabel} cell label</strong><span>${number(demand.cRateAtCutoff)}C required at 3.2 V</span><small>Gain and time withheld</small>`;
}

export function renderPerformance(version, output = 'targets', phoneActivityWatts = 0, resistanceMilliOhms = 20) {
  const { low, base, high } = performanceFor(version, output, phoneActivityWatts, resistanceMilliOhms);
  if (!base.operatingPointFeasible) return `<div class="gain unavailable"><p>Calculated at ${number(base.inputs.outputWatts, 0)} W</p><strong>${limitLabel(base)}</strong><p>${base.loadedCellVoltage === null ? 'This resistance cannot supply the requested constant power.' : `${number(base.loadedCellVoltage, 2)} V loaded, at or below the ${number(base.inputs.cutoffVoltage)} V cutoff.`}</p></div>`;
  const demand = cellDemandFor(version, base);
  if (demand.exceedsLabel) return `<div class="gain unavailable"><p>Calculated at ${number(base.inputs.outputWatts, 0)} W</p>${cellLimitMarkup(version, demand)}</div>`;
  const time = base.targetReachable ? `${number(base.minutesToDesiredGain)} min` : 'Not reached';
  return `<div class="gain"><p>Calculated iPhone charge</p><strong>${gainLabel(base.gainPercentagePoints)}</strong><div class="charge-time">in ${number(base.outputRuntimeMinutes)} min <span>at ${number(base.inputs.outputWatts, 0)} W</span></div></div>
    <div class="target-time"><span>Time to add 10 points</span><b>${time}</b></div>
    <details class="result-details"><summary>Energy and electrical demand</summary>
      <dl class="engineering-numbers">
        <div><dt>Lower / higher energy</dt><dd>${gainLabel(low.gainPercentagePoints)} / ${gainLabel(high.gainPercentagePoints)}</dd></div>
        <div><dt>Output duration range</dt><dd>${number(low.outputRuntimeMinutes)}–${number(high.outputRuntimeMinutes)} min</dd></div>
        <div><dt>Loaded cell voltage</dt><dd>${number(base.loadedCellVoltage, 2)} V</dd></div>
        <div><dt>Cell current</dt><dd>${number(base.batteryCurrentAmps, 2)} A · ${number(base.dischargeCRate)}C</dd></div>
        <div><dt>Cell + wiring heat</dt><dd>${number(base.resistiveLossWatts, 2)} W</dd></div>
        <div><dt>Converter heat</dt><dd>${number(base.converterLossWatts, 2)} W</dd></div>
      </dl><p>${powerTargetNote(version, base.inputs.outputWatts)} Heat is power lost, not a temperature prediction.</p>
    </details>`;
}

export function renderWattageRows(phoneActivityWatts = 0, resistanceMilliOhms = 20) {
  return WATTAGE_OPTIONS.map(outputWatts => {
    const estimates = versions.map(version => performanceFor(version, outputWatts, phoneActivityWatts, resistanceMilliOhms).base);
    const electrical = estimates[0];
    const demand = electrical.operatingPointFeasible
      ? `${number(electrical.batteryCurrentAmps, 2)} A · ${number(electrical.totalDeviceLossWatts, 2)} W total loss`
      : electrical.loadedCellVoltage === null ? 'Power demand exceeds scenario' : `${number(electrical.loadedCellVoltage, 2)} V loaded`;
    return `<tr data-wattage="${outputWatts}"><th scope="row"><strong>${outputWatts} W</strong><small>${demand}</small></th>${estimates.map((estimate, index) => {
      if (!estimate.operatingPointFeasible) return `<td data-wattage-version="${versions[index].id}" class="unavailable"><strong>${limitLabel(estimate)}</strong><span>No gain or runtime estimate</span></td>`;
      const demand = cellDemandFor(versions[index], estimate);
      if (demand.exceedsLabel) return `<td data-wattage-version="${versions[index].id}" class="unavailable">${cellLimitMarkup(versions[index], demand)}</td>`;
      return `<td data-wattage-version="${versions[index].id}"><strong>${gainLabel(estimate.gainPercentagePoints, 2)}</strong><span>in ${number(estimate.outputRuntimeMinutes)} min</span><small>${number(demand.cRateAtCutoff)}C at 3.2 V</small></td>`;
    }).join('')}</tr>`;
  }).join('\n');
}

export function renderVersionCard(version) {
  const caseLabel = version.kind === 'current' ? 'Fit CAD' : 'Compact target';
  return `<article class="version-card ${version.kind === 'current' ? 'current-version' : ''}" aria-labelledby="version-${version.id}" id="spark-${version.id}">
    <div class="version-heading"><span class="version-status">${caseLabel}</span><h2 id="version-${version.id}">${escapeHTML(version.name)}</h2><p>${version.capacityMah} mAh · ${dimensions(version.caseDimensions)} mm</p></div>
    <div data-performance="${version.id}">${renderPerformance(version)}</div>
    <details class="fit-details"><summary>Cell and fit details</summary><dl class="engineering-numbers"><div><dt>Cell envelope</dt><dd>${dimensions(version.cellDimensions)} mm</dd></div><div><dt>Cell mass only</dt><dd>${number(version.cellMassGrams)} ± ${number(version.cellMassToleranceGrams)} g</dd></div><div><dt>Nameplate energy</dt><dd>${number(version.capacityMah / 1000 * version.nominalVoltage, 2)} Wh</dd></div></dl><p>${dimensions(version.caseDimensions)} mm is a case target. No phone charging has been measured.</p><p>Finished mass unknown. Manufacturer label: ${escapeHTML(version.dischargeLabel)}; allowable enclosed current still requires measurement.</p><a class="cell-source" href="${escapeHTML(version.source)}" target="_blank" rel="noopener noreferrer">${escapeHTML(version.cellModel)}<span class="sr-only"> manufacturer source, opens in a new tab</span></a></details>
  </article>`;
}

export const DRAWING_UNITS_PER_MM = 3;

export function renderScaleComparison(mode = 'overlap') {
  if (!['overlap', 'individual'].includes(mode)) throw new Error(`Unknown comparison mode: ${mode}`);
  const scale = DRAWING_UNITS_PER_MM;
  const baseline = 390;
  const order = [...versions].reverse();
  const views = [
    { name: 'front', title: 'Front · width', centers: mode === 'overlap' ? [125, 160, 192] : [90, 170, 246], labelX: 239, dimension: 1 },
    { name: 'side', title: 'Side · depth', centers: mode === 'overlap' ? [333, 351, 368] : [326, 370, 412], labelX: 408, dimension: 2 },
  ];
  const ticks = Array.from({ length: 13 }, (_, index) => {
    const mm = index * 10;
    const y = baseline - mm * scale;
    return `<g class="ruler-tick" data-mm="${mm}"><line x1="36" x2="${index % 2 ? 41 : 45}" y1="${y}" y2="${y}"/>${index % 2 ? '' : `<text x="28" y="${y + 3}">${mm}</text>`}</g>`;
  }).join('');
  const grid = Array.from({ length: 7 }, (_, index) => `<line x1="45" x2="605" y1="${baseline - index * 20 * scale}" y2="${baseline - index * 20 * scale}" class="scale-grid"/>`).join('');
  const viewHTML = views.map(view => {
    const cases = order.map((version, index) => {
      const [length] = version.caseDimensions;
      const width = version.caseDimensions[view.dimension];
      const x = view.centers[index] - width * scale / 2;
      return `<rect class="case-shape scale-${version.id}" data-case-version="${version.id}" data-view="${view.name}" x="${x}" y="${baseline - length * scale}" width="${width * scale}" height="${length * scale}" rx="3"/>`;
    }).join('');
    const cells = order.map((version, index) => {
      const length = version.cellDimensions[0];
      const width = version.cellDimensions[view.dimension];
      const x = view.centers[index] - width * scale / 2;
      return `<rect class="cell-shape scale-${version.id}" data-cell-version="${version.id}" data-view="${view.name}" x="${x}" y="${baseline - (version.baseAllowance + length) * scale}" width="${width * scale}" height="${length * scale}" rx="2"/>`;
    }).join('');
    const labels = order.map((version, index) => {
      const y = baseline - version.caseDimensions[0] * scale;
      const x = view.centers[index] + version.caseDimensions[view.dimension] * scale / 2;
      return mode === 'overlap'
        ? `<g class="scale-${version.id}"><path class="size-leader" d="M ${x} ${y} H ${view.labelX - 5}"/><text class="nested-label" x="${view.labelX}" y="${y + 3}">${version.id}</text></g>`
        : `<g class="scale-${version.id}"><text class="individual-label" x="${view.centers[index]}" y="${y - 5}">${version.id}</text></g>`;
    }).join('');
    return `<g data-size-view="${view.name}"><text class="scale-name" x="${view.name === 'front' ? 170 : mode === 'overlap' ? 350 : 370}" y="19">${view.title}</text>${cases}${cells}${labels}</g>`;
  }).join('');
  const [referenceLength, referenceWidth, referenceDepth] = juulReference.dimensions;
  const referenceY = baseline - referenceLength * scale;
  const reference = `<g class="reference-item"><text class="scale-name" x="525" y="19">JUUL 2 reference</text><rect class="case-shape" data-reference-view="front" x="${500 - referenceWidth * scale / 2}" y="${referenceY}" width="${referenceWidth * scale}" height="${referenceLength * scale}" rx="3"/><rect class="case-shape" data-reference-view="side" x="${557 - referenceDepth * scale / 2}" y="${referenceY}" width="${referenceDepth * scale}" height="${referenceLength * scale}" rx="3"/><text class="view-label" x="500" y="408">Front</text><text class="view-label" x="557" y="408">Side</text><text class="status-label" x="525" y="426">${dimensions(juulReference.dimensions)} mm · approximate</text></g>`;
  const description = order.map(version => `${version.name}: case ${version.caseDimensions.join(' by ')} millimetres; battery ${version.cellDimensions.join(' by ')} millimetres`).join('. ');
  const legend = order.map(version => `<div class="size-key scale-${version.id}"><span class="size-swatch" aria-hidden="true"></span><div><strong>${escapeHTML(version.name)}</strong><span>${dimensions(version.caseDimensions)} mm case target</span><small>${dimensions(version.cellDimensions)} mm battery</small></div></div>`).join('');
  return `<svg class="size-drawing" viewBox="0 0 620 440" role="img" aria-labelledby="scale-title scale-desc"><title id="scale-title">Spark case and battery sizes, front and side</title><desc id="scale-desc">${escapeHTML(description)}. ${mode === 'overlap' ? 'Cases partially overlap, which hides parts of the battery shapes.' : 'Cases are separated to show every battery shape.'} Darker rectangles show the manufacturer-listed battery pack dimensions. Both views and the separate JUUL 2 reference use the same scale and bottom edge. The JUUL 2 dimensions are an unverified owner report; retailers disagree. Spark cases are unrouted targets; the extent of the manufacturer's pack dimensions is unconfirmed.</desc>${grid}<g class="scale-ruler"><text x="28" y="22">mm</text><line x1="36" x2="36" y1="30" y2="${baseline}"/>${ticks}</g><line x1="36" x2="605" y1="${baseline}" y2="${baseline}" class="baseline"/>${viewHTML}${reference}</svg><div class="size-legend">${legend}</div>`;
}

export const comparisonFields = {
  '__VERSION_CARDS__': versions.map(renderVersionCard).join('\n'),
  '__SCALE_COMPARISON__': renderScaleComparison(),
  '__WATTAGE_ROWS__': renderWattageRows(),
  '__PHONE_WH__': PHONE_BATTERY_WH,
  '__SOURCE_DATE__': sourceCheckedDate,
};

export function initializeSizeComparison(root = document) {
  const mode = root.querySelector('#size-view');
  const drawing = root.querySelector('.drawing-scroll');
  if (!mode || !drawing) return;
  mode.disabled = false;
  mode.addEventListener('change', () => { drawing.innerHTML = renderScaleComparison(mode.value); });
}

export function initializeComparison(root = document) {
  initializeSizeComparison(root);
  const output = root.querySelector('#output-choice');
  const activity = root.querySelector('#phone-use');
  const resistance = root.querySelector('#resistance-choice');
  if (!output || !activity || !resistance) return;
  for (const control of [output, activity, resistance]) control.disabled = false;
  const update = () => {
    const ohms = Number(resistance.value);
    for (const version of versions) {
      const container = root.querySelector(`[data-performance="${version.id}"]`);
      const open = container.querySelector('details')?.open;
      container.innerHTML = renderPerformance(version, output.value, Number(activity.value), ohms);
      if (open && container.querySelector('details')) container.querySelector('details').open = true;
    }
    root.querySelector('#estimate-status').textContent = comparisonStatus(output.value, Number(activity.value), ohms);
    root.querySelector('#wattage-rows').innerHTML = renderWattageRows(Number(activity.value), ohms);
    root.querySelector('#wattage-status').textContent = `${ohms} mΩ assumed for each size · ${activity.value} W phone use`;
  };
  for (const control of [output, activity, resistance]) control.addEventListener('change', update);
  update();
}

if (typeof document !== 'undefined') initializeComparison();
