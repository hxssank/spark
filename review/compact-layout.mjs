import compactLayout from '../electronics/compact-design/layout.json' with { type: 'json' };

const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const dimensions = values => values.join(' × ');
const number = value => Number(value.toFixed(2));

export function compactVersion(id) {
  const version = compactLayout.versions.find(item => item.id === id);
  if (!version) throw new Error(`Unknown compact version: ${id}`);
  return version;
}

export function lengthAllocation(version) {
  const bays = [
    { label: 'Base', length: version.baseMm, kind: 'clearance' },
    { label: 'Cell', length: version.cellMm[0], kind: 'cell' },
    { label: 'Connection gap', length: version.transitionMm, kind: 'clearance' },
    { label: 'PCB + USB', length: version.boardMm[1], kind: 'board' },
    { label: 'Port end', length: version.endMm, kind: 'clearance' },
  ];
  if (Math.abs(bays.reduce((sum, bay) => sum + bay.length, 0) - version.caseMm[0]) > 1e-6) {
    throw new Error(`Length allocation differs from Spark ${version.id} case`);
  }
  return bays;
}

function componentStyle(component) {
  if (/inductor|boost|charger/i.test(component.label)) return 'packing-power';
  if (/capacitor|cap bank/i.test(component.label)) return 'packing-caps';
  if (/USB/i.test(component.label)) return 'packing-port';
  return component.kind === 'reservation' ? 'packing-group' : '';
}

export function renderBoard(version, side) {
  const [width, length] = version.boardMm;
  const components = version.components.filter(component => component.side === side || component.side === 'both');
  return `<svg class="packing-board" viewBox="-1 -1 ${width + 2} ${length + 2}" role="img" aria-labelledby="packing-${version.id}-${side}-title"><title id="packing-${version.id}-${side}-title">Spark ${version.id} ${side} component reservations, ${width} by ${length} millimetres. Unrouted placement study.</title><rect class="board-outline" x="0" y="0" width="${width}" height="${length}" rx=".6"/>${components.map(component => {
    const [x0, y0, x1, y1] = component.boundsMm;
    const label = escapeHTML(component.reference);
    return `<g data-packing-ref="${label}" data-packing-side="${side}" data-bounds-mm="${component.boundsMm.join(',')}"><title>${label}: ${escapeHTML(component.label)}. ${number(x1 - x0)} × ${number(y1 - y0)} mm occupied allowance.</title><rect class="packing-component ${componentStyle(component)}" x="${x0}" y="${length - y1}" width="${x1 - x0}" height="${y1 - y0}" rx=".18"/><text class="${label.length > 5 || x1 - x0 < 2 ? 'packing-small' : ''}" x="${(x0 + x1) / 2}" y="${length - (y0 + y1) / 2}">${label}</text></g>`;
  }).join('')}</svg>`;
}

function componentZ(version, component) {
  if (component.zMm) return component.zMm;
  const bottom = version.boardZMm;
  const top = bottom + version.boardMm[2];
  if (component.side === 'both') return [bottom - component.rearHeightMm, top + component.heightMm];
  return component.side === 'back' ? [bottom - component.heightMm, bottom] : [top, top + component.heightMm];
}

export function renderStack(version) {
  const [, length, boardThickness] = version.boardMm;
  const thickness = version.caseMm[2];
  const projection = version.components.map(component => {
    const [z0, z1] = componentZ(version, component);
    const [, y0, , y1] = component.boundsMm;
    return `<rect class="stack-component" x="${z0}" y="${length - y1}" width="${z1 - z0}" height="${y1 - y0}"><title>${escapeHTML(component.reference)} ${escapeHTML(component.label)}</title></rect>`;
  }).join('');
  const stackPart = (part, label, className) => {
    if (!part?.zMm || !part?.boundsMm) return '';
    const [z0, z1] = part.zMm;
    const [, y0, , y1] = part.boundsMm;
    return `<rect class="${className}" x="${z0}" y="${length - y1}" width="${z1 - z0}" height="${y1 - y0}"><title>${label}</title></rect>`;
  };
  const lens = { boundsMm: version.display.lensBoundsMm, zMm: version.display.lensZMm };
  return `<svg class="packing-stack" viewBox="${-thickness / 2 - 1} -1 ${thickness + 2} ${length + 2}" role="img" aria-labelledby="packing-${version.id}-stack-title"><title id="packing-${version.id}-stack-title">Spark ${version.id} side projection. Board, component allowances, display and lens share the electronics bay. Parts overlap in this projection because they occupy different positions across the board width.</title><rect class="stack-outline" x="${-thickness / 2}" y="0" width="${thickness}" height="${length}" rx=".7"/>${projection}<rect class="stack-board" x="${version.boardZMm}" y="0" width="${boardThickness}" height="${length}"/>${stackPart(version.display, 'OLED reservation', 'stack-display')}${stackPart(lens, 'Lens reservation', 'stack-lens')}</svg>`;
}

export function renderCompactVersion(version) {
  const before = version.previousCaseMm[0] - version.cellMm[0];
  const after = version.caseMm[0] - version.cellMm[0];
  const bays = lengthAllocation(version);
  const frontHeight = Math.max(...version.components.filter(component => component.side !== 'back').map(component => component.heightMm));
  const frontGap = number(version.caseMm[2] / 2 - version.wallMm - version.boardZMm - version.boardMm[2] - frontHeight);
  return `<div class="compact-selected" data-compact-version="${version.id}"><dl class="compact-summary"><div><dd class="compact-number">${before} → ${after} <small>mm</small></dd><dt>Case length beyond the cell</dt></div><div><dd class="compact-number">${number(version.previousCaseMm[0] - version.caseMm[0])} <small>mm shorter</small></dd><dt>${dimensions(version.caseMm)} mm case target</dt></div><div><dd class="compact-number">${dimensions(version.boardMm.slice(0, 2))} <small>mm</small></dd><dt>PCB width × length · ${compactLayout.stackup.layers} layers</dt></div></dl><div class="compact-allocation"><div class="compact-track" role="img" aria-label="${bays.map(bay => `${bay.label} ${bay.length} mm`).join(', ')}">${bays.map(bay => `<span class="allocation-${bay.kind}" style="width:${bay.length / version.caseMm[0] * 100}%"></span>`).join('')}</div><div class="allocation-legend">${bays.map(bay => `<span><strong>${bay.length} mm</strong> ${bay.label}</span>`).join('')}</div></div><div class="compact-drawings"><figure><figcaption>Front<span>Power parts + port</span></figcaption>${renderBoard(version, 'front')}</figure><figure><figcaption>Back<span>Same board coordinates</span></figcaption>${renderBoard(version, 'back')}</figure><figure class="stack-figure"><figcaption>Side<span>OLED over the back of the PCB</span></figcaption>${renderStack(version)}<div class="stack-key"><span class="key-board">PCB</span><span class="key-parts">Parts</span><span class="key-display">OLED</span><span class="key-lens">Lens</span></div></figure></div><p class="packing-note">Occupied part and routing allowances. No copper routing or manufactured footprints. The cell size stays unchanged. Minimum front clearance to the shell is ${frontGap} mm nominal; connector and assembly tolerances are unverified. The compact case requires a new low-profile cell connection; the stock A30 plug is not fitted. <a href="../mechanical/mechanical-contract.json">Original fit CAD dimensions</a>.</p><details class="packing-details"><summary>Parts, capacitors and protection</summary><ul class="packing-key">${version.components.map(component => `<li><strong>${escapeHTML(component.reference)}</strong><span>${escapeHTML(component.label)}${component.capacitorSites ? ` · ${component.capacitorSites} reserved 0805 sites` : ''}</span></li>`).join('')}</ul><div class="compact-decisions"><div><h3>${escapeHTML(version.architecture)}</h3><p>Parallel 0805 capacitor banks use smaller parts. The site count must meet the required capacitance at operating voltage. Series wiring reduces capacitance; it does not shrink this low-voltage design.</p></div><div><h3>Protection shares the board</h3><p>Small controller and FET allowances retain cell cutoff, short-circuit protection and temperature sensing. ${compactLayout.stackup.layers} layers carry power and signals; both outer faces carry parts. Copper thickness and the finished stack still need fabrication review.</p></div></div></details><div class="compact-sources"><a href="../mechanical/compact-exports/spark_${version.id}_packing.step">Spark ${version.id} packing STEP</a><a href="../electronics/compact-design/layout.json">Placement dimensions</a><a href="../electronics/power-design.md">Circuit choices and limits</a><a href="index.html">Existing Prototype A</a></div></div>`;
}

export const compactDesignHTML = `<section class="compact-section" id="compact-design" aria-labelledby="compact-heading"><div class="compact-heading"><div><span class="compact-status">Compact placement study · Unrouted</span><h2 id="compact-heading">Less case beyond the cell</h2><p>One board, parts on both faces, and the OLED above the back. The port shares the board's length.</p></div><label class="compact-select" for="compact-version">Inspect layout<select id="compact-version" disabled>${compactLayout.versions.map(version => `<option value="${version.id}"${version.id === '850' ? ' selected' : ''}>Spark ${version.id}</option>`).join('')}</select></label></div><div id="compact-layout-content">${renderCompactVersion(compactVersion('850'))}</div></section>`;

export function initializeCompactDesign(root = document) {
  const selector = root.querySelector('#compact-version');
  const content = root.querySelector('#compact-layout-content');
  if (!selector || !content) return;
  selector.disabled = false;
  selector.addEventListener('change', () => {
    const expanded = content.querySelector('details')?.open;
    content.innerHTML = renderCompactVersion(compactVersion(selector.value));
    if (expanded) content.querySelector('details').open = true;
  });
}
