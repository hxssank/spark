import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderScheduler } from './render-scheduler.mjs';

function setup(draw, onError) {
  const frames = new Map();
  let id = 0;
  const scheduler = createRenderScheduler({
    draw,
    onError,
    requestFrame: callback => { frames.set(++id, callback); return id; },
    cancelFrame: frameId => frames.delete(frameId),
  });
  return {
    ...scheduler,
    get pending() { return frames.size; },
    advance(time) {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(time);
    },
  };
}

test('an idle model renders once and coalesces repeated updates', () => {
  let count = 0;
  const scheduler = setup(() => { count++; return false; });
  scheduler.request();
  scheduler.request();
  assert.equal(scheduler.pending, 1);
  scheduler.advance(1000);
  assert.equal(count, 1);
  assert.equal(scheduler.pending, 0);
  scheduler.advance(2000);
  assert.equal(count, 1);
});

test('damping or rotation continues until the scene stops changing', () => {
  let count = 0;
  const scheduler = setup(() => ++count < 3);
  scheduler.request();
  scheduler.advance(0);
  scheduler.advance(16);
  scheduler.advance(32);
  assert.equal(count, 3);
  assert.equal(scheduler.pending, 0);
});

test('hidden views cancel frames and resume without a time jump', () => {
  const elapsed = [];
  const scheduler = setup(delta => { elapsed.push(delta); return true; });
  scheduler.request();
  scheduler.advance(1000);
  scheduler.advance(1016);
  scheduler.setActive(false);
  scheduler.request();
  assert.equal(scheduler.pending, 0);
  scheduler.advance(9000);
  assert.deepEqual(elapsed, [0, 0.016]);
  scheduler.setActive(true);
  scheduler.advance(10000);
  assert.deepEqual(elapsed, [0, 0.016, 0]);
});

test('updates raised during a frame share one scheduled callback', () => {
  const scheduler = setup(() => { scheduler.request(); return true; });
  scheduler.request();
  scheduler.advance(0);
  assert.equal(scheduler.pending, 1);
});

test('long visible frame gaps cannot create a large rotation jump', () => {
  const elapsed = [];
  const scheduler = setup(delta => { elapsed.push(delta); return true; });
  scheduler.request();
  scheduler.advance(1000);
  scheduler.advance(11000);
  assert.deepEqual(elapsed, [0, 0.05]);
});

test('a rendering failure cancels frames and reports the error once', () => {
  const failure = new Error('GPU draw failed');
  const errors = [];
  let count = 0;
  const scheduler = setup(() => {
    count++;
    scheduler.request();
    throw failure;
  }, error => errors.push(error));
  scheduler.request();
  scheduler.advance(1000);
  assert.deepEqual(errors, [failure]);
  assert.equal(scheduler.pending, 0);
  scheduler.request();
  scheduler.advance(2000);
  assert.equal(count, 1);
  assert.equal(scheduler.pending, 0);
});

test('an unhandled rendering failure still stops the scheduler before throwing', () => {
  const scheduler = setup(() => { throw new Error('unhandled render failure'); });
  scheduler.request();
  assert.throws(() => scheduler.advance(1000), /unhandled render failure/);
  scheduler.request();
  assert.equal(scheduler.pending, 0);
});
