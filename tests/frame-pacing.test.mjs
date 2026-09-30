import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPTURE_SHARE, MAX_FPS, createFramePacer } from '../src/frame-pacing.mjs';

const steady = cost => { const pacer = createFramePacer(); for (let i = 0; i < 40; i++) pacer.record(cost); return pacer; };

test('delivery rate measures acknowledgements and pacing includes slow IPC', () => {
  const pacer = createFramePacer();
  pacer.record(3, 700, 1000);
  assert.equal(pacer.deliveredFps, null);
  pacer.record(3, 700, 1800);
  assert.equal(pacer.deliveredFps, 1.25);
  assert.ok(pacer.interval >= 840);
  pacer.reset();
  assert.equal(pacer.deliveredFps, null);
});

test('a fast PC keeps the full virtual camera frame rate', () => {
  const pacer = steady(3);
  assert.equal(pacer.fps, MAX_FPS);
  assert.ok(Math.abs(pacer.interval - 1000 / MAX_FPS) < 1e-9);
});

test('a slow PC lowers the output rate so capture stays under its share of the main thread', () => {
  for (const cost of [20, 50, 120]) {
    const pacer = steady(cost);
    assert.ok(pacer.fps < MAX_FPS, `cost ${cost} ms should lower the rate`);
    assert.ok(cost / pacer.interval <= CAPTURE_SHARE + 1e-9, `cost ${cost} ms must use at most ${CAPTURE_SHARE} of the thread`);
  }
  assert.equal(steady(50).fps, 4);
});

test('an extremely slow PC leaves enough time for UI work instead of claiming one FPS', () => {
  const pacer = steady(900);
  assert.equal(pacer.interval, 4500);
  assert.ok(pacer.fps < 1);
});

test('one slow frame does not immediately drop the rate to the floor, and recovery is gradual', () => {
  const pacer = steady(3);
  pacer.record(400);
  assert.ok(pacer.fps > 1 && pacer.fps < MAX_FPS);
  for (let i = 0; i < 40; i++) pacer.record(3);
  assert.equal(pacer.fps, MAX_FPS);
});

test('invalid measurements are ignored and reset starts over at full rate', () => {
  const pacer = steady(80);
  pacer.record(Number.NaN); pacer.record(-5); pacer.record(Infinity);
  assert.equal(pacer.fps, steady(80).fps);
  pacer.reset();
  assert.equal(pacer.fps, MAX_FPS);
});
