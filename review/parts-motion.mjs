import { initializeCompactDesign } from './compact-layout.mjs';

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const ease = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export const ASSEMBLY_STEPS = [
  ['Assembled', 'The sleeve holds the cell cover against the carrier. Start with an unpowered assembly and an inert cell gauge.'],
  ['Bottom cap', 'Remove the two M2 × 3 mm screws, then lower the bottom cap. The screw tips stay below the cell pocket.'],
  ['Outer sleeve', 'Slide the sleeve down off the carrier. Its cover glass moves with it; the OLED panel stays on the carrier.'],
  ['Cell cover', 'Lift the insulating cell cover away from the open side. The diagram separates it sideways so the cell is visible.'],
  ['Cell', 'With the connector unplugged, lift the cell from the open carrier. The actual lead bend and connector access still need a sample.'],
  ['Test board', 'Lift the separate bench board from its edge seats. This sketch is an exploded explanation; it does not validate a future board with a soldered USB socket.'],
];

export function assemblyPose(step) {
  if (!Number.isFinite(step)) throw new TypeError('Assembly step must be finite.');
  const value = clamp(step, 0, 5);
  const sleeve = clamp(value - 1, 0, 1);
  return {
    cap: [0, 55 * ease(value)],
    sleeve: [-160 * ease((sleeve - 1 / 3) * 3), 238 * ease(sleeve * 3) - 190 * ease((sleeve - 2 / 3) * 3)],
    cover: [100 * ease(value - 2), 34 * ease(value - 2)],
    cell: [190 * ease(value - 3), 0],
    board: [100 * ease(value - 4), -4 * ease(value - 4)],
  };
}

export const POWER_MODES = {
  bench: { title: 'Bench circuit today', detail: 'A current-limited laboratory supply feeds the routed boost converter. An electronic load receives its 5 V or 9 V output. The moving marks illustrate this test connection; they are not measured current.', active: ['bench-supply', 'boost', 'load'], missing: [] },
  phone: { title: 'Phone output target', detail: 'The converter is only one stage. Cell protection, temperature cutoff, output isolation, a PD source controller and the actual USB-C connection still need design before this can power a phone.', active: ['cell-source', 'boost', 'phone'], missing: ['protection', 'usb-pd'] },
  recharge: { title: 'Recharging the cartridge', detail: 'The present board does not charge a cell. USB input control, a charger matched to the cell, temperature sensing and the protected charge path are missing. A qualified external 1S charger is the current bench plan.', active: ['cell-source'], missing: ['charge-input', 'charger', 'protection'] },
};

export function powerMode(name) {
  if (!Object.hasOwn(POWER_MODES, name)) throw new RangeError('Unknown power explanation.');
  return POWER_MODES[name];
}

export function lengthDescription(bay, totalLength) {
  if (![bay.start_z_mm, bay.end_z_mm, bay.length_mm, totalLength].every(Number.isFinite) || totalLength <= 0 || bay.length_mm <= 0 || bay.start_z_mm < 0 || bay.end_z_mm > totalLength || Math.abs(bay.end_z_mm - bay.start_z_mm - bay.length_mm) > 1e-6) throw new RangeError('Invalid length allocation.');
  return `${bay.label}: ${bay.length_mm} mm, from ${bay.start_z_mm} to ${bay.end_z_mm} mm above the base. ${Number((100 * bay.length_mm / totalLength).toFixed(1))}% of the ${totalLength} mm case length.`;
}

export function assemblyExplorerHTML() {
  return `<div class="learning-panel assembly-learning" data-assembly-explorer><div class="learning-heading"><h3>How the case opens</h3><p>Follow the removal order. The diagram separates the parts for explanation; use the CAD and dry-fit instructions for physical fit.</p></div><div class="assembly-learning-grid"><div class="assembly-canvas"><svg viewBox="0 0 560 390" role="img" aria-label="Step-by-step diagram of Spark case, cell and separate test board"><title>Unpowered Spark removal sequence</title><defs><linearGradient id="sleeve-tone" x2="1"><stop stop-color="#758179"/><stop offset=".55" stop-color="#aeb8af"/><stop offset="1" stop-color="#5d6d61"/></linearGradient></defs><path d="M18 342H542" stroke="#d5dcd2"/><g fill="#6c786b" font-size="11" font-family="sans-serif"><text x="28" y="365">Simplified exploded diagram</text><text x="28" y="382">Unpowered fit only</text></g><g id="assembly-carrier"><rect x="229" y="38" width="42" height="226" rx="7" fill="#c6cdbf" stroke="#66755f"/><rect x="233" y="125" width="34" height="132" rx="3" fill="#e8ece2"/><text x="250" y="25" text-anchor="middle" fill="#42513e" font-size="11">Carrier</text></g><g data-assembly-part="board"><rect x="230" y="42" width="40" height="76" rx="2" fill="#526d57" stroke="#304b35"/><rect x="239" y="66" width="23" height="21" rx="2" fill="#29392d"/><path d="M234 96H266M234 103H266M234 110H266" stroke="#b6b17f" stroke-width="3"/><text data-part-label x="250" y="34" text-anchor="middle" fill="#42513e" font-size="11" opacity="0">Boost board</text></g><g data-assembly-part="cell"><rect x="232" y="125" width="36" height="132" rx="4" fill="#d7c6a8" stroke="#947d5f"/><path d="M236 130H264M236 252H264" stroke="#b09b7a"/><text x="250" y="196" text-anchor="middle" transform="rotate(-90 250 196)" fill="#67553d" font-size="10">850 mAh cell</text><text data-part-label x="250" y="116" text-anchor="middle" fill="#42513e" font-size="11" opacity="0">Cell</text></g><g data-assembly-part="cover"><rect x="229" y="123" width="42" height="136" rx="3" fill="#8e9d87" fill-opacity=".94" stroke="#66765e"/><text data-part-label x="250" y="282" text-anchor="middle" fill="#42513e" font-size="11" opacity="0">Cell cover</text></g><g data-assembly-part="sleeve"><rect x="226" y="46" width="48" height="218" rx="6" fill="url(#sleeve-tone)" stroke="#536450"/><rect x="236" y="62" width="28" height="36" rx="2" fill="#25362c"/><text x="250" y="218" text-anchor="middle" font-size="9" letter-spacing="2" fill="#e8ede6" transform="rotate(-90 250 218)">SPARK</text><text data-part-label x="250" y="35" text-anchor="middle" fill="#42513e" font-size="11" opacity="0">Outer sleeve</text></g><g data-assembly-part="cap"><rect x="226" y="264" width="48" height="6" rx="2" fill="#73856b" stroke="#536450"/><circle cx="238" cy="267" r="1.5" fill="#d2d9ce"/><circle cx="262" cy="267" r="1.5" fill="#d2d9ce"/><text data-part-label x="250" y="291" text-anchor="middle" fill="#42513e" font-size="11" opacity="0">Bottom cap</text></g></svg><div class="learning-controls" hidden><button type="button" data-assembly-play>Play removal</button><label>Step <input type="range" min="0" max="5" step="0.01" value="0" data-assembly-range aria-label="Removal sequence step"></label></div></div><ol class="assembly-steps">${ASSEMBLY_STEPS.map(([title, detail], index) => `<li${index === 0 ? ' class="current"' : ''}><button type="button" data-assembly-step="${index}" aria-pressed="${index === 0}">${escapeHTML(title)}</button><p>${escapeHTML(detail)}</p></li>`).join('')}</ol></div><p class="motion-preference" data-motion-note></p></div>`;
}

export function powerExplorerHTML() {
  const node = (id, x, y, width, title, subtitle, missing = false) => `<g data-power-node="${id}" class="power-node${missing ? ' missing' : ''}" transform="translate(${x} ${y})"><rect width="${width}" height="52" rx="7"/><text x="${width / 2}" y="21" text-anchor="middle">${title}</text><text class="power-subtitle" x="${width / 2}" y="38" text-anchor="middle">${subtitle}</text></g>`;
  return `<div class="learning-panel power-learning" data-power-explorer><div class="learning-heading"><h3>What the electronics do</h3><p>The boost converter raises voltage. It cannot negotiate USB-C power, protect the cell or recharge it.</p></div><div class="power-tabs learning-controls" hidden><button data-power-mode="bench" type="button" aria-pressed="true">Bench circuit</button><button data-power-mode="phone" type="button" aria-pressed="false">Phone output</button><button data-power-mode="recharge" type="button" aria-pressed="false">Recharge</button></div><div class="power-canvas"><svg viewBox="0 0 880 310" role="img" aria-label="Existing bench boost path and missing phone-output and charging circuits"><title>Existing and missing power circuits</title><defs><marker id="power-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L8 4L0 8Z" fill="#82927c"/></marker></defs><g fill="none" stroke="#a5af9d" stroke-width="2" marker-end="url(#power-arrow)"><path data-power-line="bench" d="M166 40H308"/><path data-power-line="bench" d="M458 40H718"/><path data-power-line="phone" d="M166 150H198"/><path data-power-line="phone" d="M328 150H383V66"/><path data-power-line="phone" d="M458 40H510V150H548"/><path data-power-line="phone" d="M688 150H718"/><path data-power-line="recharge" d="M688 256H458"/><path data-power-line="recharge" d="M308 256H263V176"/><path data-power-line="recharge" d="M198 150H166"/></g>${node('bench-supply', 16, 14, 150, 'Bench supply', '3.0–4.2 V input')}${node('boost', 308, 14, 150, 'Boost converter', 'Routed test board')}${node('load', 718, 14, 146, 'Electronic load', '5 V or 9 V test')}${node('cell-source', 16, 124, 150, '850 mAh cell', 'Sample candidate')}${node('protection', 198, 124, 130, 'Cell protection', 'Not implemented', true)}${node('usb-pd', 548, 124, 140, 'PD + isolation', 'Not implemented', true)}${node('phone', 718, 124, 146, 'USB-C phone', 'Target connection')}${node('charger', 308, 230, 150, 'Cell charger', 'Not implemented', true)}${node('charge-input', 548, 230, 140, 'USB-C input', 'Not implemented', true)}<text x="16" y="298" fill="#687561" font-size="11">Green = selected connection. Dashed amber = circuits still missing.</text></svg></div><div class="power-explanation"><div><h4 data-power-title>${POWER_MODES.bench.title}</h4><p data-power-detail>${POWER_MODES.bench.detail}</p></div><button type="button" data-power-play hidden>Animate test path</button></div><p class="motion-preference" data-motion-note></p></div>`;
}

export function lengthExplorerHTML(contract) {
  const bays = contract.space_budget.longitudinal_bays;
  return `<div class="length-explorer" data-length-explorer hidden><label for="length-bay">Inspect a section</label><select id="length-bay">${bays.map((bay, index) => `<option value="${index}">${escapeHTML(bay.label)} · ${bay.length_mm} mm</option>`).join('')}</select><p data-length-description aria-live="polite">${escapeHTML(lengthDescription(bays[0], contract.dimensions.length))}</p><script type="application/json" data-length-data>${JSON.stringify({ bays, length: contract.dimensions.length }).replaceAll('<', '\\u003c')}</script></div>`;
}

function createPlayer(root, tick, changed) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let playing = false; let visible = true; let request = 0; let previous = 0;
  const note = root.querySelector('[data-motion-note]');
  function schedule() {
    if (playing && visible && !document.hidden && !reduced.matches && !request) request = requestAnimationFrame(frame);
  }
  function frame(now) {
    request = 0;
    const delta = previous ? Math.min((now - previous) / 1000, 0.1) : 0;
    previous = now;
    if (!tick(delta)) playing = false;
    changed(playing); schedule();
  }
  function suspend() { if (request) cancelAnimationFrame(request); request = 0; previous = 0; }
  function preferences() {
    if (reduced.matches) { playing = false; suspend(); }
    if (note) note.textContent = reduced.matches ? 'Reduced motion is on. Choose a step or circuit to see its static explanation.' : '';
    changed(playing); schedule();
  }
  reduced.addEventListener('change', preferences);
  document.addEventListener('visibilitychange', () => { suspend(); schedule(); });
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => { visible = entries[0].isIntersecting; suspend(); schedule(); }).observe(root);
  preferences();
  return {
    get playing() { return playing; }, get reduced() { return reduced.matches; },
    play() { if (reduced.matches) return; playing = true; previous = 0; changed(true); schedule(); },
    pause() { playing = false; suspend(); changed(false); },
  };
}

function initAssembly(root) {
  const controls = root.querySelector('.learning-controls'); controls.hidden = false;
  const play = root.querySelector('[data-assembly-play]');
  const range = root.querySelector('[data-assembly-range]');
  const steps = [...root.querySelectorAll('[data-assembly-step]')];
  let value = 0; let target = 5; let speed = 0.8;
  function show(next) {
    value = clamp(next, 0, 5); range.value = String(value);
    const pose = assemblyPose(value);
    for (const [name, offset] of Object.entries(pose)) {
      const group = root.querySelector(`[data-assembly-part="${name}"]`);
      group.setAttribute('transform', `translate(${offset[0]} ${offset[1]})`);
      group.querySelector('[data-part-label]').setAttribute('opacity', Math.hypot(...offset) > 30 ? '1' : '0');
    }
    const selected = Math.round(value);
    for (const button of steps) { const active = Number(button.dataset.assemblyStep) === selected; button.setAttribute('aria-pressed', String(active)); button.closest('li').classList.toggle('current', active); }
  }
  const player = createPlayer(root, delta => {
    const remaining = target - value;
    show(Math.abs(remaining) <= delta * speed ? target : value + Math.sign(remaining) * delta * speed);
    return Math.abs(target - value) > 0.0001;
  }, playing => { play.textContent = playing ? 'Pause' : value >= 5 ? 'Replay removal' : 'Play removal'; });
  function updateReduced() { play.disabled = player.reduced; }
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', updateReduced); updateReduced();
  play.addEventListener('click', () => { if (player.playing) player.pause(); else { if (value >= 5) show(0); target = 5; speed = 0.8; player.play(); } });
  steps.forEach(button => button.addEventListener('click', () => { player.pause(); target = Number(button.dataset.assemblyStep); if (player.reduced) show(target); else { speed = Math.max(2, Math.abs(target - value) / 0.65); player.play(); } }));
  range.addEventListener('input', () => { player.pause(); show(Number(range.value)); });
  show(0);
}

function initPower(root) {
  root.querySelector('.power-tabs').hidden = false;
  const play = root.querySelector('[data-power-play]'); play.hidden = false;
  let name = 'bench'; let elapsed = 0;
  const player = createPlayer(root, delta => {
    elapsed += delta;
    if (name === 'bench') root.querySelectorAll('[data-power-line="bench"]').forEach(line => line.style.strokeDashoffset = String(-elapsed * 75));
    else root.querySelectorAll('.power-node.highlight').forEach(node => node.style.opacity = String(0.7 + 0.3 * Math.cos(elapsed * Math.PI * 2)));
    if (elapsed >= 3) { root.querySelectorAll('.power-node').forEach(node => node.style.opacity = ''); return false; }
    return true;
  }, playing => { play.textContent = playing ? 'Pause' : name === 'bench' ? 'Animate test path' : 'Highlight missing stages'; });
  function show(mode) {
    const details = powerMode(mode); name = mode; elapsed = 0; player.pause();
    root.querySelector('[data-power-title]').textContent = details.title;
    root.querySelector('[data-power-detail]').textContent = details.detail;
    root.querySelectorAll('[data-power-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.powerMode === mode)));
    root.querySelectorAll('[data-power-node]').forEach(node => { node.classList.toggle('active', details.active.includes(node.dataset.powerNode)); node.classList.toggle('highlight', details.missing.includes(node.dataset.powerNode)); node.style.opacity = ''; });
    root.querySelectorAll('[data-power-line]').forEach(line => { line.classList.toggle('active', line.dataset.powerLine === mode); line.style.strokeDashoffset = ''; });
  }
  play.addEventListener('click', () => { if (player.playing) player.pause(); else { if (elapsed >= 3) elapsed = 0; player.play(); } });
  root.querySelectorAll('[data-power-mode]').forEach(button => button.addEventListener('click', () => show(button.dataset.powerMode)));
  function updateReduced() { play.disabled = player.reduced; }
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', updateReduced); updateReduced(); show('bench');
}

function initLength(root) {
  const data = JSON.parse(root.querySelector('[data-length-data]').textContent);
  const section = root.closest('section'); const select = root.querySelector('select'); root.hidden = false;
  function show() {
    const index = Number(select.value);
    root.querySelector('[data-length-description]').textContent = lengthDescription(data.bays[index], data.length);
    section.querySelectorAll('.length-track span, .length-legend li').forEach((element, at) => element.classList.toggle('length-selected', at % data.bays.length === index));
  }
  select.addEventListener('change', show); show();
}

if (typeof document !== 'undefined') {
  initializeCompactDesign();
  document.querySelectorAll('[data-assembly-explorer]').forEach(initAssembly);
  document.querySelectorAll('[data-power-explorer]').forEach(initPower);
  document.querySelectorAll('[data-length-explorer]').forEach(initLength);
}
