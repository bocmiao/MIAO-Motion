import assert from 'node:assert/strict';
import test from 'node:test';
import { MToonMaterial } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { collectModelMetrics, gazeAngles, idleBlink, mirrorMotion, relativeHeadRotation } from '../src/avatar-utils.mjs';

test('model metrics include MToon uniforms and morph targets', () => {
  const root = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  geometry.morphAttributes.position = [new THREE.BufferAttribute(new Float32Array(9), 3)];
  const material = new MToonMaterial();
  material.map = new THREE.Texture({ width: 1024, height: 512 });
  material.shadeMultiplyTexture = new THREE.Texture({ width: 2048, height: 2048 });
  root.add(new THREE.Mesh(geometry, material));

  const metrics = collectModelMetrics(root, 1234);
  assert.equal(metrics.textures, 2);
  assert.equal(metrics.maxTextureSize, 2048);
  assert.equal(metrics.geometryBytes, 72);
  assert.equal(metrics.triangles, 1);
});

test('mirror mode swaps lateral face channels only when disabled', () => {
  const motion = { blinkLeft: 0.2, blinkRight: 0.8, lookLeft: 0.3, lookRight: 0.7, lookUp: 0.4, lookDown: 0.1 };
  assert.deepEqual(mirrorMotion(motion, true), motion);
  assert.deepEqual(mirrorMotion(motion, false), { ...motion, blinkLeft: 0.8, blinkRight: 0.2, lookLeft: 0.7, lookRight: 0.3 });
});

test('gaze angles and relative head rotation are bounded', () => {
  assert.deepEqual(gazeAngles({ blinkLeft: 0, blinkRight: 0, lookLeft: 1, lookRight: 0, lookUp: 1, lookDown: 0 }), { yaw: 30, pitch: 20 });
  const neutral = new THREE.Quaternion();
  const current = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 1.2, 0, 'YXZ'));
  const mirrored = new THREE.Euler().setFromQuaternion(relativeHeadRotation(current, neutral, 1, true), 'YXZ');
  const direct = new THREE.Euler().setFromQuaternion(relativeHeadRotation(current, neutral, 1, false), 'YXZ');
  assert.ok(Math.abs(mirrored.y - 0.85) < 1e-6);
  assert.ok(Math.abs(direct.y + 0.85) < 1e-6);
});

test('idle blink closes and reopens without exceeding expression bounds', () => {
  const values = Array.from({ length: 4_200 }, (_, index) => idleBlink(index));
  assert.ok(values.some((value) => value > 0.95));
  assert.ok(values.every((value) => value >= 0 && value <= 1));
});
