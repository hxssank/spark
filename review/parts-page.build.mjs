import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderFitSummary } from './fit-summary.mjs';
import { build } from 'esbuild';
import { assemblyExplorerHTML, lengthExplorerHTML, powerExplorerHTML } from './parts-motion.mjs';
import { compactDesignHTML } from './compact-layout.mjs';
import { renderPackingComparison } from './packing-comparison.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const readJSON = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
export async function buildPartsPage() {
  const [contract, placements, circuit, geometry] = await Promise.all([
    readJSON('mechanical/mechanical-contract.json'),
    readJSON('electronics/boost-prototype/component-placement.json'),
    readJSON('electronics/boost-prototype/circuit.json'),
    readJSON('mechanical/exports/geometry-report.json'),
  ]);
  const format = values => values.map(value => Number(value.toFixed(2))).join(' × ');
  const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const mechanicalSource = { label: 'Mechanical contract', href: '../mechanical/mechanical-contract.json' };
  const circuitSource = { label: 'Circuit source', href: '../electronics/boost-prototype/circuit.json' };
  const placementSource = { label: 'Board placement', href: '../electronics/boost-prototype/component-placement.json' };
  const printed = {
    sleeve: ['Outer sleeve', 'The printed sleeve holds the carrier and cell cover. The graphite finish is a study for a later aluminium version.'],
    carrier: ['Insulating carrier', 'Locates the cell and PCB. The rear opening holds the display candidate without changing the cell pocket.'],
    front_cover: ['Cell cover', 'Covers the cell and slides under the sleeve. No fastener enters the pouch pocket.'],
    bottom_cap: ['Bottom cap', 'Closes the lower end with two M2 × 3 mm screws. The plastic threads still need a pullout and reuse test.'],
  };
  const catalog = {};
  for (const [name, [label, detail]] of Object.entries(printed)) {
    catalog[name] = { label, category: 'case', detail, status: 'Printable design', specs: [format(geometry[name].bounds_mm) + ' mm envelope'], provenance: [{ label: 'Print STL', href: `../mechanical/print_parts/${name}.stl` }, mechanicalSource] };
  }
  catalog.battery_reference = {
    label: 'GNB 850 mAh cell', category: 'cell', status: 'Sample candidate',
    detail: 'GNB8501S60WHV manufacturer pack dimensions. The supplier does not define whether seams, lead exit or connector are included; check a sample.',
    specs: [`${format([contract.cell.envelope[2], contract.cell.envelope[0], contract.cell.envelope[1]])} mm nominal`, '850 mAh at 3.8 V, manufacturer specification'],
    provenance: [{ label: 'Cell manufacturer', href: 'https://www.gaoneng.shop/products/gaoneng-gnb-lihv-1s-3.8v-850mah-60c-a30-cabled-lipo-battery-long-range' }, mechanicalSource],
  };
  catalog.a30_unmeasured_reference = {
    label: 'A30 connector allowance', category: 'cell', status: 'Unmeasured allowance',
    detail: 'A 6 × 6 × 12 mm placeholder for the mating connector. Terminal positions, lead bend and installed size are not measured.',
    specs: [format(contract.a30_reference.envelope) + ' mm allowance'],
    provenance: [{ label: 'Connector manufacturer', href: 'https://www.gaoneng.shop/products/gaoneng-a30-connector-adapter-for-fpv-whoops-quads-lipo-battery' }, mechanicalSource],
  };
  catalog.pcb_reference = {
    label: 'Boost test board', category: 'electronics', status: 'Routed design',
    detail: 'The four-layer board converts a bench supply to 5 V or 9 V. It has no USB-C PD, charger, cell protection, temperature cutoff or output isolation.',
    specs: [format([contract.pcb.length, contract.pcb.width, contract.pcb.thickness]) + ' mm', '4 layers; 2/1/1/2 oz copper'],
    provenance: [{ label: 'KiCad PCB', href: '../electronics/boost-prototype/spark_boost_rev_a.kicad_pcb' }, { label: 'Schematic PDF', href: '../electronics/boost-prototype/spark_boost_rev_a.pdf' }],
  };
  catalog.usb_reference = {
    label: 'USB-C socket allowance', category: 'electronics', status: 'Provisional location',
    detail: 'A generic socket body reserves the port position. The selected connector, support, wiring and PD circuit still need design.',
    specs: [format(contract.usb.opening) + ' mm case opening', contract.usb.recess + ' mm recess'], provenance: [mechanicalSource],
  };
  catalog.usb_tongue_reference = {
    label: 'USB-C tongue allowance', category: 'electronics', status: 'Provisional location',
    detail: 'Visual tongue inside the generic socket. It does not represent electrical contacts or a working connector.',
    specs: [format(geometry.usb_tongue_reference.bounds_mm) + ' mm visual allowance'], provenance: [mechanicalSource],
  };
  const functions = {
    U1: ['Boost converter', 'TPS61288L raises the input voltage. Its shutdown input does not isolate the output or protect a cell.'],
    L1: ['Power inductor', '2.2 µH Coilcraft XAL1060. Mount its marked short winding lead toward the SW label on the board.'],
    C1: ['Input capacitor', '22 µF input capacitor. Effective capacitance and installed temperature still need measurement.'],
    C2: ['VIN bypass capacitor', '100 nF local bypass on the converter input supply. Exact manufacturer part and height remain unselected.'],
    C3: ['VCC capacitor', '4.7 µF KYOCERA AVX capacitor for the converter internal bias supply. Installed height and effective capacitance remain unverified.'],
    C4: ['Bootstrap capacitor', '100 nF between BST and SW. Exact manufacturer part and height remain unselected.'],
    R1: ['Feedback upper resistor', '110 kΩ upper leg of the output-voltage divider.'],
    R2: ['Feedback lower resistor', '15 kΩ lower leg sets 5 V with R1 when JP1 is open.'],
    R3: ['9 V selection resistor', '16.5 kΩ joins the lower feedback leg when JP1 is closed, selecting 9 V.'],
    JP1: ['Voltage selection jumper', 'Leave open for 5 V. Close for 9 V only with input power disconnected. This is a solder jumper, not a USB-C negotiation circuit.'],
    R4: ['Compensation resistor', '12.4 kΩ resistor in the proposed loop-compensation network. Stability has not been measured.'],
    C11: ['Compensation capacitor', '8.2 nF capacitor in the proposed loop-compensation network.'],
    C12: ['Compensation filter capacitor', '10 pF capacitor from COMP to ground.'],
    R5: ['Enable pulldown', '100 kΩ holds the converter disabled when the enable pad is open.'],
    J1: ['Input positive pad', 'Connect the isolated current-limited bench supply positive here. Prototype input range is 3.0–4.2 V.'],
    J2: ['Input ground pad', 'Bench-supply return and reference for the external enable control.'],
    J3: ['Output positive pad', 'Connect to an electronic load. This is not a phone charging connection.'],
    J4: ['Output ground pad', 'Electronic-load return.'],
    J5: ['Enable pad', 'Drive with an external 3.3 V control signal referenced to J2. EN does not disconnect the output.'],
  };
  for (let number = 5; number <= 10; number++) functions[`C${number}`] = ['Output capacitor', 'One of six 22 µF output capacitors. The bank is 132 µF nominal; the compensation requires at least 60 µF effective under bias.'];
  const circuitByRef = new Map(circuit.components.map(component => [component.ref, component]));
  for (const placement of placements.components) {
    const ref = placement.reference;
    const component = circuitByRef.get(ref);
    if (!component || !functions[ref]) throw new Error(`Missing component information for ${ref}`);
    const name = ref === 'L1' ? 'inductor_reference' : ref === 'C1' ? 'input_cap_reference'
      : placement.is_pcb_feature ? `${ref.toLowerCase()}_pad_reference`
      : ref === 'U1' || /^C(?:[5-9]|10)$/.test(ref) ? `${ref.toLowerCase()}_reference`
      : `${ref.toLowerCase()}_unmeasured_reference`;
    const [label, detail] = functions[ref];
    const bounds = placement.body_bounds_board_xy_mm;
    const height = placement.maximum_body_height_mm;
    const specs = [component.value];
    if (!placement.is_pcb_feature) specs.push(`${placement.side === 'back' ? 'Rear' : 'Front'} of PCB; ${format([bounds[2] - bounds[0], bounds[3] - bounds[1]])} mm body`);
    if (height !== null) specs.push(`${height} mm maximum body height, before solder`);
    const provenance = [circuitSource, placementSource];
    if (component.source) provenance.unshift({ label: 'Component source', href: component.source });
    catalog[name] = { label: `${ref} · ${label}`, category: 'electronics', detail,
      status: placement.is_pcb_feature ? 'PCB feature' : component.mpn ? 'Selected component' : 'Part unselected', specs, provenance };
  }
  const display = contract.display;
  const displaySource = { label: 'Display manufacturer', href: display.source };
  catalog.display_glass_reference = {
    label: `${Number((Math.hypot(...display.active_area) / 25.4).toFixed(1))}-inch colour OLED`, category: 'display', status: 'Panel candidate',
    detail: `${display.candidate}. The glass fits the current model; its flex drawing, connector, electrical supply and retention still need confirmation.`,
    specs: [`${format([display.glass_envelope[0], display.glass_envelope[2], display.glass_envelope[1]])} mm glass`, `${format(display.resolution_px)} RGB pixels`], provenance: [displaySource, mechanicalSource],
  };
  catalog.display_active_reference = {
    label: 'OLED active area', category: 'display', status: 'Visual reference',
    detail: 'The preview draws an example charge or capacity-health screen. No telemetry is connected; real readings remain unknown.',
    specs: [format(display.active_area) + ' mm active area', 'Centred position provisional'], provenance: [displaySource, mechanicalSource],
  };
  catalog.display_lens_reference = {
    label: 'Flush cover glass', category: 'display', status: 'Provisional part',
    detail: 'The cover glass sits flush with the sleeve exterior and stays on the sleeve during removal. The 3D preview studies a colour-matched finish that hides the window and reveals only lit pixels. Coating transmission, colour match, adhesive and service method remain unverified.',
    specs: [format([display.lens_envelope[0], display.lens_envelope[2], display.lens_envelope[1]]) + ' mm'], provenance: [mechanicalSource],
  };
  catalog.display_fpc_keepout_reference = {
    label: 'OLED flex allowance', category: 'display', status: 'Unmeasured allowance',
    detail: 'Space reserved for the flex and connector. This block is not a cable or a verified bend path.',
    specs: [format(display.fpc_keepout_envelope) + ' mm reserved'], provenance: [mechanicalSource],
  };
  const names = Object.keys(catalog).sort();
  if (JSON.stringify(names) !== JSON.stringify(Object.keys(geometry).sort())) throw new Error('Part catalog and CAD assembly names differ.');

  const link = ({ label, href }) => `<a href="${escapeHTML(href)}">${escapeHTML(label)}</a>`;
  const card = (name, showSpecs = true) => {
    const part = catalog[name];
    return `<article class="part-card" id="${escapeHTML(name)}"><div class="card-heading"><h3>${escapeHTML(part.label)}</h3><span class="badge">${escapeHTML(part.status)}</span></div><p>${escapeHTML(part.detail)}</p>${showSpecs && part.specs.length ? `<ul class="facts">${part.specs.map(spec => `<li>${escapeHTML(spec)}</li>`).join('')}</ul>` : ''}<div class="source-links">${part.provenance.map(link).join('')}</div></article>`;
  };
  const componentGroups = [
    { refs: ['U1'] }, { refs: ['L1'] }, { refs: ['C1'] }, { refs: ['C2'] }, { refs: ['C3'] }, { refs: ['C4'] },
    { refs: ['C5', 'C6', 'C7', 'C8', 'C9', 'C10'], label: 'Output capacitor bank', value: '6 × 22 µF, 25 V, X7R, 1210', detail: '132 µF nominal in total. The compensation requires at least 60 µF effective capacitance under bias.' },
    { refs: ['R1', 'R2', 'R3'], label: 'Output voltage divider', value: '110 kΩ / 15 kΩ / 16.5 kΩ, 0.1%', detail: 'R1 and R2 set 5 V. JP1 connects R3 to the lower leg to select 9 V.' },
    { refs: ['JP1'] },
    { refs: ['R4', 'C11', 'C12'], label: 'Loop compensation', value: '12.4 kΩ / 8.2 nF / 10 pF', detail: 'Compensation candidates for the 5 V and 9 V settings. Load-step and loop-gain measurements have not run.' },
    { refs: ['R5'] },
    { refs: ['J1', 'J2'], label: 'Bench-supply pads', value: 'J1 positive / J2 ground', detail: 'Use an isolated, current-limited 3.0 to 4.2 V bench supply. J2 also references the enable control.' },
    { refs: ['J3', 'J4'], label: 'Electronic-load pads', value: 'J3 positive / J4 ground', detail: 'Output connection for an electronic load. This is not a phone charging connection.' },
    { refs: ['J5'] },
  ];
  const listed = componentGroups.flatMap(group => group.refs).sort();
  if (JSON.stringify(listed) !== JSON.stringify([...circuitByRef.keys()].sort())) throw new Error('Component table does not cover the circuit exactly once.');
  const componentRows = componentGroups.map(group => {
    const ref = group.refs[0];
    const component = circuitByRef.get(ref);
    const name = Object.keys(catalog).find(key => catalog[key].label.startsWith(ref + ' ·'));
    for (const itemRef of group.refs) {
      const itemName = Object.keys(catalog).find(key => catalog[key].label.startsWith(itemRef + ' ·'));
      catalog[itemName].detailId = name;
    }
    return `<tr id="${escapeHTML(name)}"><th scope="row">${escapeHTML(group.refs.join(', '))}</th><td><strong>${escapeHTML(group.label || functions[ref][0])}</strong><span>${escapeHTML(group.value || component.value)}</span></td><td>${escapeHTML(group.detail || functions[ref][1])}</td><td>${escapeHTML(catalog[name].status)}</td></tr>`;
  }).join('\n');
  let html = await readFile(resolve(here, 'parts-page.template.html'), 'utf8');
  const motion = await build({ entryPoints: [resolve(here, 'parts-motion.mjs')], bundle: true,
    minify: true, format: 'iife', target: ['es2020'], write: false });
  const replacements = {
    '__ENCLOSURE__': format([contract.dimensions.length, contract.dimensions.width, contract.dimensions.thickness]),
    '__PART_COUNT__': names.length,
    '__CELL_LENGTH__': format([contract.cell.envelope[2]]),
    '__CELL_WIDTH__': format([contract.cell.envelope[0]]),
    '__CELL_THICKNESS__': format([contract.cell.envelope[1]]),
    '__CELL_GAUGE_HEIGHT__': 198 * contract.cell.envelope[0] / contract.cell.envelope[2],
    '__CELL_GAUGE_INNER_HEIGHT__': 198 * contract.cell.envelope[0] / contract.cell.envelope[2] - 10,
    '__CELL_GAUGE_Y__': 68 - 99 * contract.cell.envelope[0] / contract.cell.envelope[2],
    '__CELL_GAUGE_INNER_Y__': 73 - 99 * contract.cell.envelope[0] / contract.cell.envelope[2],
    '__OLED_GLASS__': format([display.glass_envelope[0], display.glass_envelope[2]]),
    '__OLED_DIAGONAL__': Number((Math.hypot(...display.active_area) / 25.4).toFixed(1)),
    '__SPACE_SUMMARY__': renderFitSummary(contract),
    '__COMPACT_DESIGN__': compactDesignHTML,
    '__PACKING_COMPARISON__': renderPackingComparison(),
    '__LENGTH_EXPLORER__': lengthExplorerHTML(contract),
    '__ASSEMBLY_EXPLORER__': assemblyExplorerHTML(),
    '__POWER_EXPLORER__': powerExplorerHTML(),
    '__PARTS_MOTION__': motion.outputFiles[0].text.replaceAll('</script', '<\\/script'),
    '__CASE_CARDS__': Object.keys(printed).map(name => card(name)).join('\n'),
    '__CELL_CARDS__': ['battery_reference', 'a30_unmeasured_reference'].map(name => card(name)).join('\n'),
    '__BOARD_CARDS__': ['pcb_reference', 'usb_reference', 'usb_tongue_reference'].map(name => card(name)).join('\n'),
    '__COMPONENT_ROWS__': componentRows,
    '__DISPLAY_CARDS__': ['display_glass_reference', 'display_active_reference', 'display_lens_reference', 'display_fpc_keepout_reference'].map(name => card(name)).join('\n'),
  };
  for (const [key, value] of Object.entries(replacements)) html = html.replaceAll(key, () => String(value));
  if (/__[A-Z_]+__/.test(html)) throw new Error('Unfilled parts-page template field.');
  return {
    'review/parts.html': html,
    'review/part-catalog.mjs': 'export const partCatalog = ' + JSON.stringify(catalog, null, 2) + ';\n',
  };
}
