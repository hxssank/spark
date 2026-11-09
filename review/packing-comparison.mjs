import { versions, juulReference } from './versions.mjs';
import { compactVersion } from './compact-layout.mjs';

const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const number = (value, digits = 1) => Number(value.toFixed(digits)).toLocaleString('en-CA', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const dimensions = values => values.join(' × ');

export const DRAWING_UNITS_PER_MM = 2.4;

export function renderPackingComparison() {
  const scale = DRAWING_UNITS_PER_MM;
  const baseline = 340;
  const centers = [125, 260, 395];
  const ruler = Array.from({ length: 13 }, (_, index) => {
    const mm = index * 10;
    const y = baseline - mm * scale;
    return `<g class="ruler-tick" data-mm="${mm}"><line x1="45" x2="${index % 2 ? 52 : 57}" y1="${y}" y2="${y}"/>${index % 2 ? '' : `<text x="35" y="${y + 3}">${mm}</text>`}</g>`;
  }).join('');
  const grid = Array.from({ length: 7 }, (_, index) => `<line x1="57" x2="605" y1="${baseline - index * 20 * scale}" y2="${baseline - index * 20 * scale}" class="scale-grid"/>`).join('');
  const designs = versions.map((version, index) => {
    const center = centers[index];
    const [length, width] = version.caseDimensions;
    const [cellLength, cellWidth] = version.cellDimensions;
    const [boardWidth, boardLength] = version.boardDimensions;
    const layout = compactVersion(version.id);
    const cellTop = baseline - (layout.baseMm + cellLength) * scale;
    const boardTop = baseline - (layout.baseMm + cellLength + layout.transitionMm + boardLength) * scale;
    return `<g class="scale-item scale-${version.id}" data-case-version="${version.id}">
      <rect class="case-shape" x="${center - width * scale / 2}" y="${baseline - length * scale}" width="${width * scale}" height="${length * scale}" rx="4"/>
      <rect class="cell-shape" data-cell-version="${version.id}" x="${center - cellWidth * scale / 2}" y="${cellTop}" width="${cellWidth * scale}" height="${cellLength * scale}" rx="2"/>
      <rect class="pcb-shape" data-pcb-version="${version.id}" x="${center - boardWidth * scale / 2}" y="${boardTop}" width="${boardWidth * scale}" height="${boardLength * scale}" rx="1"/>
      <text class="diagram-part" x="${center}" y="${cellTop + cellLength * scale / 2}">Cell</text><text class="diagram-part pcb-label" x="${center}" y="${boardTop + boardLength * scale / 2}">PCB</text>
      <text class="size-label" x="${center}" y="365">${escapeHTML(version.name)}</text>
      <text class="status-label" x="${center}" y="382">${length} mm</text></g>`;
  }).join('');
  const [referenceLength, referenceWidth] = juulReference.dimensions;
  const referenceTop = baseline - referenceLength * scale;
  const reference = `<g class="reference-item"><rect class="case-shape" x="${535 - referenceWidth * scale / 2}" y="${referenceTop}" width="${referenceWidth * scale}" height="${referenceLength * scale}" rx="4"/><text class="size-label" x="535" y="365">JUUL reference</text><text class="status-label" x="535" y="382">${referenceLength} mm · approximate</text></g>`;
  const legend = versions.map(version => {
    const [length] = version.caseDimensions;
    const difference = `${number(version.previousCaseDimensions[0] - length, 0)} mm shorter than previous ${version.id} · ${number(length - version.cellDimensions[0], 0)} mm beyond cell`;
    return `<div class="size-key scale-${version.id}"><span class="size-swatch" aria-hidden="true"></span><div><strong>${escapeHTML(version.name)}</strong><span>${dimensions(version.caseDimensions)} mm</span><small>${difference}</small></div></div>`;
  }).join('');
  const description = versions.map(version => `${version.name}: case ${version.caseDimensions.join(' by ')} millimetres, battery ${version.cellDimensions[0]} millimetres long, board ${version.boardDimensions[1]} millimetres long`).join('. ');
  return `<svg class="size-drawing" viewBox="0 0 620 390" role="img" aria-labelledby="scale-title scale-desc"><title id="scale-title">Spark sizes side by side, front view</title><desc id="scale-desc">${escapeHTML(description)}. Cases share the same scale and bottom edge. Darker rectangles show the battery, lighter green rectangles show the PCB, and unfilled space includes the base and connection gaps. JUUL reference: ${juulReference.dimensions.join(' by ')} millimetres, approximate. All three Spark cases are unrouted placement targets.</desc>${grid}<g class="scale-ruler"><text x="35" y="39">mm</text><line x1="45" x2="45" y1="52" y2="${baseline}"/>${ruler}</g><line x1="45" x2="605" y1="${baseline}" y2="${baseline}" class="baseline"/>${designs}${reference}</svg><div class="diagram-legend"><span><i class="legend-cell"></i>Battery</span><span><i class="legend-pcb"></i>PCB</span><span><i class="legend-case"></i>Case and gaps</span></div><div class="size-legend">${legend}</div>`;
}

