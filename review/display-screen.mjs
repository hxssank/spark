const LABEL_GLYPHS = {
  A: ['010', '101', '111', '101', '101'],
  C: ['111', '100', '100', '100', '111'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  G: ['111', '100', '101', '101', '111'],
  H: ['101', '101', '111', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'],
  N: ['101', '111', '111', '111', '101'],
  O: ['111', '101', '101', '101', '111'],
  R: ['110', '101', '110', '101', '101'],
  T: ['111', '010', '010', '010', '010'],
  '%': ['101', '001', '010', '100', '101'],
  ' ': ['000', '000', '000', '000', '000'],
};
const VALUE_GLYPHS = {
  '2': ['11111', '00001', '00001', '11111', '10000', '10000', '11111'],
  '4': ['10001', '10001', '10001', '11111', '00001', '00001', '00001'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '9': ['11111', '10001', '10001', '11111', '00001', '00001', '11111'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
};

export function displayReadout(simulated = false, mode = 'charge') {
  const demo = simulated === true;
  const selectedMode = mode === 'health' ? 'health' : 'charge';
  return {
    demo,
    mode: selectedMode,
    chargePercent: demo ? 72 : null,
    healthPercent: demo ? 94 : null,
    valuePercent: demo ? (selectedMode === 'health' ? 94 : 72) : null,
    statusLabel: demo ? 'DEMO' : 'NO DATA',
    caption: demo
      ? 'Simulation only. 72% charge and 94% health use a fictitious learned battery profile.'
      : 'No telemetry. Charge and battery health remain unknown.',
  };
}

function text(context, value, x, y, glyphs, scale = 1) {
  const width = glyphs === VALUE_GLYPHS ? 5 : 3;
  for (const character of value) {
    const glyph = glyphs[character] ?? LABEL_GLYPHS[' '];
    glyph.forEach((row, rowIndex) => {
      for (let column = 0; column < row.length; column++) {
        if (row[column] === '1') {
          context.fillRect(x + column * scale, y + rowIndex * scale, scale, scale);
        }
      }
    });
    x += (width + 1) * scale;
  }
}

function centeredLabel(context, value, y) {
  text(context, value, Math.floor((64 - (value.length * 4 - 1)) / 2), y, LABEL_GLYPHS);
}

export function drawDisplay(canvas, simulated = false, mode = 'charge') {
  if (canvas.width !== 64) canvas.width = 64;
  if (canvas.height !== 64) canvas.height = 64;
  const context = canvas.getContext('2d');
  const reading = displayReadout(simulated, mode);
  if (!context) return reading;
  context.imageSmoothingEnabled = false;
  context.globalAlpha = 1;
  context.clearRect(0, 0, 64, 64);

  context.fillStyle = '#969a99';
  centeredLabel(context, reading.mode === 'health' ? 'HEALTH' : 'CHARGE', 8);

  const value = reading.valuePercent === null ? '--' : String(reading.valuePercent);
  context.fillStyle = '#e7e3d8';
  text(context, value, 15, 19, VALUE_GLYPHS, 3);
  if (reading.valuePercent !== null) {
    context.fillStyle = '#b9b9ae';
    text(context, '%', 52, 35, LABEL_GLYPHS);
  }

  context.fillStyle = '#41464b';
  context.fillRect(15, 45, 34, 1);
  if (reading.valuePercent !== null) {
    context.fillStyle = '#b9b9ae';
    context.fillRect(15, 45, Math.round(reading.valuePercent * 34 / 100), 1);
  }
  context.fillStyle = reading.demo ? '#d0c9ba' : '#969a99';
  centeredLabel(context, reading.statusLabel, 54);
  return reading;
}
