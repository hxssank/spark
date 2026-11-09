import test from 'node:test';
import assert from 'node:assert/strict';
import { displayReadout, drawDisplay } from './display-screen.mjs';

function pixelCanvas() {
  const pixels = new Array(64 * 64);
  const context = {
    fillStyle: '',
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    clearRect(x, y, width, height) {
      for (let row = y; row < y + height; row++) {
        for (let column = x; column < x + width; column++) pixels[row * 64 + column] = null;
      }
    },
    fillRect(x, y, width, height) {
      assert.ok([x, y, width, height].every(Number.isInteger), 'OLED drawing must stay on its pixel grid');
      assert.ok(x >= 0 && y >= 0 && x + width <= 64 && y + height <= 64, 'drawing must fit the panel');
      for (let row = y; row < y + height; row++) {
        for (let column = x; column < x + width; column++) {
          pixels[row * 64 + column] = `${this.fillStyle}/${this.globalAlpha}`;
        }
      }
    },
  };
  return { width: 0, height: 0, pixels, context, getContext: () => context };
}

test('the display cannot imply measured charge or health without telemetry', () => {
  const reading = displayReadout();
  assert.equal(reading.chargePercent, null);
  assert.equal(reading.healthPercent, null);
  assert.equal(reading.statusLabel, 'NO DATA');
  assert.match(reading.caption, /No telemetry/);
});

test('charge and health examples require explicit simulation and identify the fictitious profile', () => {
  const reading = displayReadout(true, 'health');
  assert.equal(reading.chargePercent, 72);
  assert.equal(reading.healthPercent, 94);
  assert.equal(reading.valuePercent, 94);
  assert.equal(reading.statusLabel, 'DEMO');
  assert.match(reading.caption, /Simulation only/);
  assert.match(reading.caption, /fictitious learned battery profile/);
});

test('truthy non-boolean values cannot enable demo data', () => {
  for (const value of ['false', 'true', 1, {}]) {
    assert.equal(displayReadout(value).valuePercent, null);
  }
});

test('switching to health cannot produce a value without simulation', () => {
  const reading = displayReadout(false, 'health');
  assert.equal(reading.healthPercent, null);
  assert.equal(reading.valuePercent, null);
});

test('unknown readings draw at 64 pixels with an empty meter', () => {
  const canvas = pixelCanvas();
  const reading = drawDisplay(canvas);
  assert.equal(canvas.width, 64);
  assert.equal(canvas.height, 64);
  assert.equal(canvas.context.imageSmoothingEnabled, false);
  assert.equal(reading.valuePercent, null);
  for (let x = 15; x < 49; x++) {
    assert.equal(canvas.pixels[45 * 64 + x], '#41464b/1');
  }
  assert.equal(canvas.pixels[0], null, 'Unlit pixels must reveal the case finish.');
});

test('both simulated modes retain the demo label and show their meter levels', () => {
  for (const mode of ['charge', 'health']) {
    const canvas = pixelCanvas();
    const reading = drawDisplay(canvas, true, mode);
    assert.equal(reading.statusLabel, 'DEMO');
    assert.equal(canvas.pixels[54 * 64 + 24], '#d0c9ba/1');
    const meter = canvas.pixels.slice(45 * 64 + 15, 45 * 64 + 49);
    const lit = meter.filter(pixel => pixel === '#b9b9ae/1').length;
    assert.ok(Math.abs(lit / meter.length * 100 - reading.valuePercent) < 2);
    assert.ok(meter.includes('#41464b/1'), 'A partial charge must not look full.');
  }
});

test('elapsed time cannot animate the display or change its reading', () => {
  const first = pixelCanvas();
  const later = pixelCanvas();
  assert.deepEqual(drawDisplay(first, false, 'health', 0), drawDisplay(later, false, 'health', 1));
  assert.deepEqual(first.pixels, later.pixels);
});

test('redrawing removes old demo pixels instead of leaving light trails', () => {
  const reused = pixelCanvas();
  const fresh = pixelCanvas();
  drawDisplay(reused, true, 'charge', 0);
  drawDisplay(reused, false, 'charge', 1);
  drawDisplay(fresh, false, 'charge', 1);
  assert.deepEqual(reused.pixels, fresh.pixels);
});

test('missing canvas context and invalid animation times retain unknown data', () => {
  assert.equal(drawDisplay({ width: 64, height: 64, getContext: () => null }).valuePercent, null);
  const first = pixelCanvas();
  const invalid = pixelCanvas();
  drawDisplay(first);
  drawDisplay(invalid, false, 'charge', NaN);
  assert.deepEqual(first.pixels, invalid.pixels);
});
