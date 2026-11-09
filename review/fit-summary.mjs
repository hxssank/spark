const number = value => Number(value.toFixed(2));
const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export function validateFitSummary(contract) {
  const length = contract.dimensions.length;
  const budget = contract.space_budget;
  if (!Number.isFinite(length) || length <= 0 || !budget?.longitudinal_bays?.length) throw new Error('Missing case length allocation.');
  let end = 0;
  for (const bay of budget.longitudinal_bays) {
    if (![bay.start_z_mm, bay.end_z_mm, bay.length_mm].every(Number.isFinite)
      || bay.length_mm <= 0 || Math.abs(bay.start_z_mm - end) > 1e-6
      || Math.abs(bay.end_z_mm - bay.start_z_mm - bay.length_mm) > 1e-6) {
      throw new Error(`Case length allocation has a gap, overlap or invalid length at ${bay.label}.`);
    }
    end = bay.end_z_mm;
  }
  if (Math.abs(end - length) > 1e-6) throw new Error('Case length allocation does not match the enclosure.');
  if (!Array.isArray(contract.clearances) || !contract.clearances.length) throw new Error('Missing CAD clearance measurements.');
  for (const clearance of contract.clearances) {
    if (!Number.isFinite(clearance.nominal_mm) || clearance.nominal_mm < 0) throw new Error(`Invalid CAD clearance for ${clearance.label}.`);
  }
  for (const key of ['external_box_volume_mm3', 'modeled_occupancy_mm3', 'unallocated_volume_mm3']) {
    if (!Number.isFinite(budget[key]) || budget[key] < 0) throw new Error(`Invalid case volume ${key}.`);
  }
  return budget;
}

export function renderFitSummary(contract) {
  const budget = validateFitSummary(contract);
  const track = budget.longitudinal_bays.map(bay => `<span style="width:${bay.length_mm / contract.dimensions.length * 100}%"></span>`).join('');
  const legend = budget.longitudinal_bays.map(bay => `<li><strong>${number(bay.length_mm)} mm</strong>${escapeHTML(bay.label)}</li>`).join('');
  const clearances = contract.clearances.map(clearance => `<div><dt>${escapeHTML(clearance.label)}<small>${escapeHTML(clearance.status)}</small></dt><dd>${number(clearance.nominal_mm)} mm</dd></div>`).join('');
  return `<div class="length-track" aria-hidden="true">${track}</div><ul class="length-legend" aria-label="Case length allocation">${legend}</ul><div class="space-summary"><div><h3>Volume allocation</h3><p class="volume">${number(budget.external_box_volume_mm3 / 1000)} cm³ <span>outer bounding box</span></p><p>${number(budget.modeled_occupancy_mm3 / 1000)} cm³ of modeled solids and ${number(budget.unallocated_volume_mm3 / 1000)} cm³ unallocated inside the rounded case.</p><p>${escapeHTML(budget.note)}</p><a href="../mechanical/mechanical-contract.json">Dimensions and fit measurements</a></div><div><h3>Nominal CAD gaps</h3><dl class="clearance-list">${clearances}</dl></div></div>`;
}
