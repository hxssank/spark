import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFitSummary, validateFitSummary } from './fit-summary.mjs';

function fixture() {
  return {
    dimensions: { length: 116 },
    space_budget: {
      external_box_volume_mm3: 41203.2,
      modeled_occupancy_mm3: 21000,
      unallocated_volume_mm3: 19000,
      longitudinal_bays: [
        { label: 'Base', start_z_mm: 0, end_z_mm: 6.5, length_mm: 6.5 },
        { label: 'Cell', start_z_mm: 6.5, end_z_mm: 72.5, length_mm: 66 },
        { label: 'Leads', start_z_mm: 72.5, end_z_mm: 76, length_mm: 3.5 },
        { label: 'PCB', start_z_mm: 76, end_z_mm: 114, length_mm: 38 },
        { label: 'Port end', start_z_mm: 114, end_z_mm: 116, length_mm: 2 },
      ],
      note: 'Includes clearance and missing circuitry, not usable board capacity.',
    },
    clearances: [{ label: 'Rear capacitor to carrier', nominal_mm: 0.35, status: 'Nominal CAD gap' }],
  };
}

test('case allocation uses source dimensions and preserves fractional gaps', () => {
  const contract = fixture();
  const html = renderFitSummary(contract);
  assert.match(html, /3.5 mm/);
  assert.match(html, /0.35 mm/);
  assert.match(html, /41.2 cm³/);
  assert.match(html, /not usable board capacity/);
  contract.dimensions.length = 118;
  contract.space_budget.longitudinal_bays[4].end_z_mm = 118;
  contract.space_budget.longitudinal_bays[4].length_mm = 4;
  assert.match(renderFitSummary(contract), /4 mm/);
});

test('a gap, overlap or length mismatch cannot become a misleading space diagram', () => {
  for (const change of [
    contract => { contract.space_budget.longitudinal_bays[2].start_z_mm += 0.1; },
    contract => { contract.space_budget.longitudinal_bays[2].start_z_mm -= 0.1; },
    contract => { contract.space_budget.longitudinal_bays[2].length_mm = 5; },
    contract => { contract.dimensions.length = 117; },
    contract => { contract.clearances[0].nominal_mm = -0.1; },
  ]) {
    const contract = fixture();
    change(contract);
    assert.throws(() => validateFitSummary(contract));
  }
});

test('source descriptions cannot insert HTML into the generated report', () => {
  const contract = fixture();
  contract.space_budget.note = '<script>unsafe</script>';
  contract.clearances[0].status = 'Unverified <sample>';
  const html = renderFitSummary(contract);
  assert.match(html, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.match(html, /Unverified &lt;sample&gt;/);
  assert.ok(!html.includes('<script>'));
});
