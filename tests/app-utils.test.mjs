import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  cameraConstraints,
  cameraErrorMessage,
  onboardingState,
  parseSettings,
  scaleMotion,
  trackingQuality,
  validateModelFile,
} from '../src/app-utils.mjs';

assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
assert.deepEqual(parseSettings('{broken'), DEFAULT_SETTINGS);
assert.deepEqual(parseSettings('{"background":"green","cameraId":"cam-2","sensitivity":9}'), {
  background: 'green', cameraId: 'cam-2', onboardingComplete: false, sensitivity: 1.5,
});
assert.equal(parseSettings('{"onboardingComplete":true}').onboardingComplete, true);

assert.equal(validateModelFile({ name: 'avatar.png', size: 2 }, 100), '请选择 .vrm 模型文件');
assert.equal(validateModelFile({ name: 'avatar.vrm', size: 0 }, 100), '模型文件为空，请重新导出后再试');
assert.match(validateModelFile({ name: 'avatar.vrm', size: 101 }, 100), /模型超过/);
assert.equal(validateModelFile({ name: 'AVATAR.VRM', size: 100 }, 100), '');

assert.equal(cameraConstraints('cam-2').video.deviceId.exact, 'cam-2');
assert.equal(cameraConstraints().video.facingMode, 'user');
assert.match(cameraErrorMessage({ name: 'NotAllowedError' }), /权限/);
assert.match(cameraErrorMessage({ name: 'NotReadableError' }), /占用/);
assert.equal(trackingQuality(25, true).level, 'good');
assert.equal(trackingQuality(15, true).level, 'fair');
assert.equal(trackingQuality(8, true).level, 'weak');
assert.equal(trackingQuality(30, false).value, 0);
const scaled = scaleMotion({ blink: 0.8, smile: 0.4 }, 1.5);
assert.equal(scaled.blink, 1);
assert.ok(Math.abs(scaled.smile - 0.6) < Number.EPSILON * 2);
assert.deepEqual(onboardingState(1, false, false), { current: 1, canContinue: false, nextLabel: '下一步', progress: '2/4' });
assert.equal(onboardingState(1, true, false).canContinue, true);
assert.equal(onboardingState(2, true, false).canContinue, false);
assert.equal(onboardingState(2, true, true).canContinue, true);
assert.deepEqual(onboardingState(99, true, true), { current: 3, canContinue: true, nextLabel: '完成，开始使用', progress: '4/4' });

console.log('app utility checks passed');
