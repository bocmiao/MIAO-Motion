import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutoQuality } from '../src/auto-quality.mjs';

/** Feed frames at a steady rate; returns every end-of-window report. */
function run(controller, { fps, seconds, bodyTracking, start = 1 }) {
  const reports = [];
  for (let t = start; t <= start + seconds * 1000; t += 1000 / fps) {
    const report = controller.frame(t, bodyTracking);
    if (report) reports.push(report);
  }
  return reports;
}

test('without body tracking, two slow 5 s windows (20 fps) lower the render scale', () => {
  const quality = createAutoQuality();
  run(quality, { fps: 20, seconds: 11, bodyTracking: false });
  assert.equal(quality.ratio, 1.25);
});

test('during body tracking the same 20 fps dip keeps the render scale, but it is not switched off', () => {
  const quality = createAutoQuality();
  const reports = run(quality, { fps: 20, seconds: 31, bodyTracking: true });
  assert.ok(reports.length >= 6, 'auto quality keeps measuring while body tracking');
  assert.ok(reports.every(r => r.bodyTracking && r.ratio === 1.5));
  // A sustained, severe slowdown still steps down: four windows below 18 fps.
  const slow = createAutoQuality();
  run(slow, { fps: 12, seconds: 16, bodyTracking: true });
  assert.equal(slow.ratio, 1.5, 'three slow windows are tolerated');
  run(slow, { fps: 12, seconds: 5, bodyTracking: true, start: 16_001 });
  assert.equal(slow.ratio, 1.25);
});

test('recovering frame rate raises the scale again and hidden pages reset the window', () => {
  const quality = createAutoQuality();
  run(quality, { fps: 10, seconds: 21, bodyTracking: false });
  assert.equal(quality.ratio, 1);
  run(quality, { fps: 60, seconds: 21, bodyTracking: false, start: 21_001 });
  assert.equal(quality.ratio, 1.25);
  quality.reset(50_000);
  assert.equal(quality.frame(50_100, false), null);
});
