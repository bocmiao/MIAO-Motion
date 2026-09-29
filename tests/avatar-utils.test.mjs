import assert from 'node:assert/strict';
import test from 'node:test';
import { MToonMaterial, VRM, VRMHumanoid, VRMUtils } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { applyNaturalPose, frameAvatar, vrmRotation, collectModelMetrics, gazeAngles, idleBlink, relativeHeadRotation } from '../src/avatar-utils.mjs';
import { mirrorFace } from '../src/mirror.mjs';

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

test('mirror on (like a mirror) moves one-sided eye channels to the avatar\'s other side; off keeps them', () => {
  // Only the source-left eye is closed and only a source-left gaze is present.
  const motion = { blinkLeft: 0.9, blinkRight: 0, lookLeft: 0.6, lookRight: 0, lookUp: 0.4, lookDown: 0.1 };
  assert.deepEqual(mirrorFace(motion, false), motion);
  assert.deepEqual(mirrorFace(motion, true), { ...motion, blinkLeft: 0, blinkRight: 0.9, lookLeft: 0, lookRight: 0.6 });
  // Head yaw follows the same rule: mirror on reverses the avatar-side direction.
  const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.3, 0, 'YXZ'));
  const yaw = mirror => new THREE.Euler().setFromQuaternion(relativeHeadRotation(turn, new THREE.Quaternion(), 1, mirror), 'YXZ').y;
  assert.ok(yaw(false) > 0.29 && yaw(true) < -0.29);
});

test('gaze angles and relative head rotation are bounded', () => {
  assert.deepEqual(gazeAngles({ blinkLeft: 0, blinkRight: 0, lookLeft: 1, lookRight: 0, lookUp: 1, lookDown: 0 }), { yaw: 30, pitch: -20 });
  const neutral = new THREE.Quaternion();
  const current = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 1.2, 0, 'YXZ'));
  const mirrored = new THREE.Euler().setFromQuaternion(relativeHeadRotation(current, neutral, 1, true), 'YXZ');
  const direct = new THREE.Euler().setFromQuaternion(relativeHeadRotation(current, neutral, 1, false), 'YXZ');
  assert.ok(Math.abs(mirrored.y + 0.85) < 1e-6);
  assert.ok(Math.abs(direct.y - 0.85) < 1e-6);
});

test('mirror reflects yaw/roll but keeps pitch, independently of neutral pose', () => {
  for (const axis of ['x', 'y', 'z']) {
    const neutral = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.2, 0.03));
    const rotation = new THREE.Euler(0, 0, 0, 'YXZ'); rotation[axis] = 0.2;
    const current = neutral.clone().multiply(new THREE.Quaternion().setFromEuler(rotation));
    for (const mirror of [true, false]) {
      const actual = new THREE.Euler().setFromQuaternion(relativeHeadRotation(current, neutral, 1, mirror), 'YXZ');
      assert.ok(Math.abs(actual[axis] - (mirror && axis !== 'x' ? -0.2 : 0.2)) < 1e-6);
    }
  }
});

function syntheticVrm(version) {
  const scene = new THREE.Group();
  const bones = {};
  const add = (name, parent, position) => {
    const node = new THREE.Object3D(); node.position.set(...position);
    (bones[parent]?.node ?? scene).add(node); bones[name] = { node }; return node;
  };
  add('hips', '', [0, 0.9, 0]); add('spine', 'hips', [0, 0.2, 0]);
  add('chest', 'spine', [0, 0.2, 0]); add('head', 'chest', [0, 0.25, 0]);
  for (const [side, sign] of [['left', 1], ['right', -1]]) {
    const x = version === '0' ? -sign : sign;
    add(`${side}UpperArm`, 'chest', [x * 0.15, 0, 0]);
    add(`${side}LowerArm`, `${side}UpperArm`, [x * 0.3, 0, 0]);
    add(`${side}Hand`, `${side}LowerArm`, [x * 0.25, 0, 0]);
    add(`${side}Foot`, 'hips', [x * 0.12, -0.9, 0]);
  }
  scene.updateMatrixWorld(true);
  const humanoid = new VRMHumanoid(bones);
  const vrm = new VRM({ scene, humanoid, meta: { metaVersion: version } });
  VRMUtils.rotateVRM0(vrm);
  return vrm;
}

for (const version of ['0', '1']) {
  test(`VRM ${version}: hands below shoulders, head pitch/roll and bone framing`, () => {
    const vrm = syntheticVrm(version);
    let resets = 0; vrm.springBoneManager = { setInitState() { resets++; } };
    applyNaturalPose(vrm);
    assert.equal(resets, 1);
    const world = name => vrm.humanoid.getRawBoneNode(name).getWorldPosition(new THREE.Vector3());
    for (const side of ['left', 'right']) assert.ok(world(`${side}Hand`).y < world(`${side}UpperArm`).y - 0.4);
    for (const [axis, component] of [['x', 'y'], ['z', 'x']]) {
      const e = new THREE.Euler(); e[axis] = 0.2;
      const head = vrm.humanoid.getNormalizedBoneNode('head');
      head.quaternion.copy(vrmRotation(new THREE.Quaternion().setFromEuler(e), version));
      vrm.humanoid.update(); vrm.scene.updateMatrixWorld(true);
      const q = vrm.humanoid.getRawBoneNode('head').getWorldQuaternion(new THREE.Quaternion());
      const direction = new THREE.Vector3(0, axis === 'z' ? 1 : 0, axis === 'x' ? (version === '0' ? -1 : 1) : 0).applyQuaternion(q);
      assert.ok(direction[component] < -0.1, `${axis}: consistent world direction`);
    }
    for (const preset of ['head', 'upper', 'full']) {
      const camera = new THREE.PerspectiveCamera(30, 9 / 16, 0.1, 100);
      frameAvatar(vrm, camera, new THREE.Vector3(), preset);
      const projected = world('head').project(camera);
      assert.ok(Math.abs(projected.x) < 0.8 && projected.y >= -0.01 && projected.y < 0.95, `${preset}: head visible in upper half`);
    }
  });
}

test('idle blink closes and reopens without exceeding expression bounds', () => {
  const values = Array.from({ length: 4_200 }, (_, index) => idleBlink(index));
  assert.ok(values.some((value) => value > 0.95));
  assert.ok(values.every((value) => value >= 0 && value <= 1));
});
