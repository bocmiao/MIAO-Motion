import assert from 'node:assert/strict';
import test from 'node:test';
import { damping, lerpMotion, solveExpressions } from '../src/motion.mjs';

const categories = [
  { categoryName: 'eyeBlinkLeft', score: 0.75 },
  { categoryName: 'eyeBlinkRight', score: 0.04 },
  { categoryName: 'jawOpen', score: 0.65 },
  { categoryName: 'mouthSmileLeft', score: 0.8 },
  { categoryName: 'mouthSmileRight', score: 0.8 },
];

test('face blendshapes map to bounded avatar expressions', () => {
const solved = solveExpressions(categories);
assert.equal(solved.blinkLeft, 1);
assert.equal(solved.blinkRight, 0);
assert.equal(solved.aa, 1);
assert.equal(solved.happy, 1);
});

test('motion interpolation remains stable', () => {
assert.ok(damping(1 / 60) > 0 && damping(1 / 60) < 1);
assert.deepEqual(lerpMotion({ aa: 0 }, { aa: 1 }, 0.25), { aa: 0.25 });
});
