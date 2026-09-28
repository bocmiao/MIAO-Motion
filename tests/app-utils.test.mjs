import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SETTINGS,
  cameraConstraints,
  cameraErrorMessage,
  coarseUserAgent,
  createSettingsProfile,
  createWithGpuFallback,
  estimateModelPerformance,
  modelLoadErrorMessage,
  onboardingState,
  parseDiagnosticEvents,
  parseSettings,
  parseSettingsProfile,
  renderPixelRatio,
  sanitizeDiagnosticMessage,
  scaleMotion,
  stopMediaStream,
  trackingQuality,
  validateModelFile,
} from '../src/app-utils.mjs';

test('settings parsing uses safe defaults and bounds', () => {
assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
assert.deepEqual(parseSettings('{broken'), DEFAULT_SETTINGS);
assert.deepEqual(parseSettings('{"background":"green","cameraId":"cam-2","sensitivity":9}'), {
  activeModelId: '', background: 'green', cameraId: 'cam-2', mirror: true, onboardingComplete: false, outputAspect: 'auto', renderQuality: 'balanced', sensitivity: 1.5, smoothing: 1, viewPreset: 'upper',
});
assert.equal(parseSettings('{"onboardingComplete":true}').onboardingComplete, true);
assert.equal(parseSettings('{"renderQuality":"quality"}').renderQuality, 'quality');
assert.equal(parseSettings('{"renderQuality":"unknown"}').renderQuality, 'balanced');
});

test('model, camera, tracking, onboarding, and render helpers', () => {
assert.equal(validateModelFile({ name: 'avatar.png', size: 2 }, 100), '请选择 .vrm 模型文件');
assert.equal(validateModelFile({ name: 'avatar.vrm', size: 0 }, 100), '模型文件为空，请重新导出后再试');
assert.match(validateModelFile({ name: 'avatar.vrm', size: 101 }, 100), /模型超过/);
assert.equal(validateModelFile({ name: 'AVATAR.VRM', size: 100 }, 100), '');

assert.equal(cameraConstraints('cam-2').video.deviceId.exact, 'cam-2');
assert.equal(cameraConstraints().video.facingMode, 'user');
const stopped = [];
stopMediaStream({ getTracks: () => [{ stop: () => stopped.push('video') }, { stop: () => stopped.push('audio') }] });
assert.deepEqual(stopped, ['video', 'audio']);
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

assert.equal(renderPixelRatio('performance', 3), 1);
assert.equal(renderPixelRatio('balanced', 3), 1.5);
assert.equal(renderPixelRatio('quality', 3), 2);
const normalModel = estimateModelPerformance({ fileBytes: 20e6, triangles: 50_000, materials: 10, textures: 8, maxTextureSize: 2048, textureBytes: 100e6, geometryBytes: 5e6 });
assert.equal(normalModel.level, 'good');
assert.equal(estimateModelPerformance({ fileBytes: 90e6, triangles: 50_000, materials: 10, textures: 8, maxTextureSize: 2048, textureBytes: 100e6, geometryBytes: 5e6 }).level, 'warning');
assert.equal(estimateModelPerformance({ fileBytes: 20e6, triangles: 250_000, materials: 10, textures: 8, maxTextureSize: 2048, textureBytes: 100e6, geometryBytes: 5e6 }).level, 'heavy');
});

test('settings profiles, GPU fallback, error hints, and diagnostics privacy', async () => {
const profile = createSettingsProfile({ ...DEFAULT_SETTINGS, background: 'green', sensitivity: 1.4 });
assert.deepEqual(parseSettingsProfile(JSON.stringify(profile)), { activeModelId: '', background: 'green', mirror: true, outputAspect: 'auto', renderQuality: 'balanced', sensitivity: 1.4, smoothing: 1, viewPreset: 'upper' });
assert.deepEqual(parseSettingsProfile(JSON.stringify({ format: 'miao-motion-settings', version: 1, settings: { background: 'green' } })), { activeModelId: '', background: 'green', mirror: true, outputAspect: 'auto', renderQuality: 'balanced', sensitivity: 1, smoothing: 1, viewPreset: 'upper' });
assert.equal(parseSettingsProfile('{"format":"other"}'), null);
const delegates = [];
const fallback = await createWithGpuFallback(async (options) => {
  delegates.push(options.baseOptions.delegate);
  if (options.baseOptions.delegate === 'GPU') throw new Error('GPU unavailable');
  return 'cpu-detector';
}, { baseOptions: { modelAssetPath: '/local.task' } });
assert.equal(fallback, 'cpu-detector');
assert.deepEqual(delegates, ['GPU', 'CPU']);
assert.match(modelLoadErrorMessage(new Error('WebGL context lost due to allocation')), /内存或显存/);
assert.match(modelLoadErrorMessage(new SyntaxError('Unexpected token')), /文件结构/);
assert.doesNotMatch(sanitizeDiagnosticMessage(new Error('read C:\\Users\\Miao Luo\\avatar.vrm')), /Miao|avatar/);
assert.equal(sanitizeDiagnosticMessage('failed file:///home/miao/avatar.vrm)'), 'failed file:[redacted])');
assert.equal(sanitizeDiagnosticMessage('failed blob:http://127.0.0.1/private-id'), 'failed blob:[redacted]');
assert.equal(sanitizeDiagnosticMessage('read //server/share/private/avatar.vrm'), 'read [local-path-redacted]');
assert.equal(sanitizeDiagnosticMessage('read C:/Users/Miao/avatar.vrm'), 'read [local-path-redacted]');
assert.equal(sanitizeDiagnosticMessage('read /mnt/c/Users/Miao/avatar.vrm'), 'read [local-path-redacted]');
assert.equal(sanitizeDiagnosticMessage('read /Volumes/Private/avatar.vrm'), 'read [local-path-redacted]');
assert.equal(coarseUserAgent('Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36'), 'Chrome/140');
assert.equal(coarseUserAgent('secret agent'), 'Unknown browser');
assert.deepEqual(parseDiagnosticEvents('{broken'), []);
assert.deepEqual(parseDiagnosticEvents(JSON.stringify([{ at: '2026-01-01', kind: 'error', message: 'C:\\Users\\Miao\\model.vrm' }])), [{ at: '2026-01-01', kind: 'error', message: '[local-path-redacted]' }]);
});
