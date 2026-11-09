import compactLayout from '../electronics/compact-design/layout.json' with { type: 'json' };
export { PHONE_BATTERY_WH } from './performance-model.mjs';

export const juulReference = Object.freeze({
  dimensions: [97, 16, 7],
  note: 'With-pod dimensions from one unverified owner report. Retailers publish conflicting dimensions.',
});

export const versions = [
  {
    id: '300', name: 'Spark 300', capacityMah: 300, nominalVoltage: 3.8,
    cellDimensions: [51, 11.5, 6.7], 
    evaluationWatts: 10, cellMassGrams: 7.2, cellMassToleranceGrams: 0.5, dischargeLabel: '60C', dischargeLabelCRate: 60,
    cellModel: 'GNB3001S60WHV · A30 cabled', kind: 'concept',
    source: 'https://www.gaoneng.shop/products/gaoneng-gnb-lihv-1s-3.8v-300mah-60c-a30-cabled-lipo-battery',
    tradeoff: 'The smallest carry. Enough for a few percentage points, but one cell cannot add 10 points even before conversion losses.',
    fitNote: '80 × 20 × 11 mm is a compact placement target. A 17 × 24 mm board replaces the old 50 mm non-cell allowance with 29 mm. The complete circuit is unrouted; connector, display and thermal fit remain unverified.',
  },
  {
    id: '530', name: 'Spark 530', capacityMah: 530, nominalVoltage: 3.8,
    cellDimensions: [59, 17.5, 6.5], 
    evaluationWatts: 15, cellMassGrams: 12, cellMassToleranceGrams: 1, dischargeLabel: '90C', dischargeLabelCRate: 90,
    cellModel: 'GNB5301S90PHV · A30 plastic head', kind: 'concept',
    source: 'https://www.gaoneng.shop/products/gaoneng-gnb-lihv-1s-3.8v-530mah-90c-a30-plastic-head-lipo-battery',
    tradeoff: 'A thinner middle size with 77% more cell energy than the 300. Still short of 10 added points in all three modeled energy scenarios.',
    fitNote: '88 × 23.5 × 12 mm is a compact placement target. A 20 × 24 mm board gives 29 mm beyond the cell. It needs a complete routed circuit and measured connector, display and thermal clearances.',
  },
  {
    id: '850', name: 'Spark 850', capacityMah: 850, nominalVoltage: 3.8,
    cellDimensions: [66, 18, 7.7], 
    evaluationWatts: 25, cellMassGrams: 17.5, cellMassToleranceGrams: 1, dischargeLabel: '60C', dischargeLabelCRate: 60,
    cellModel: 'GNB8501S60WHV · A30 cabled', kind: 'concept',
    source: 'https://www.gaoneng.shop/products/gaoneng-gnb-lihv-1s-3.8v-850mah-60c-a30-cabled-lipo-battery-long-range',
    tradeoff: 'The most energy and the best chance of adding 10 points. Its larger cell lowers C-rate at a given output, but 25 W still requires thermal and protection tests.',
    fitNote: '99 × 24 × 12 mm is a compact placement target with a 20 × 28 mm board. The existing exported fit CAD remains 116 × 24 × 14.8 mm. Neither design has measured phone output.',
  },
].map(version => {
  const layout = compactLayout.versions.find(item => item.id === version.id);
  if (!layout) throw new Error(`Missing compact layout for Spark ${version.id}`);
  return { ...version, caseDimensions: layout.caseMm, previousCaseDimensions: layout.previousCaseMm,
    boardDimensions: layout.boardMm, baseAllowance: layout.baseMm };
});

export const currentVersion = Object.freeze({
  ...versions.find(version => version.id === '850'),
  kind: 'current', caseDimensions: [116, 24, 14.8], boardDimensions: [20, 38, 1], baseAllowance: 6.5,
  fitNote: 'Existing Prototype A fit CAD with a bench boost converter. USB-C, charging, protection and display circuits are incomplete.',
});
export const sourceCheckedDate = '2026-10-30';
