// One-sided actions must land on the same avatar side on every input path, in both mirror states.
// Avatar side is measured on real VRM files in world space (the avatar faces +Z, so its own left is +X).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { SOURCE_LEFT_IS_SUBJECT_LEFT, avatarSide, mapSide, mirrorFace } from '../src/mirror.mjs';
import { solveExpressions } from '../src/motion.mjs';
import { gazeAngles, relativeHeadRotation, vrmRotation, applyNaturalPose } from '../src/avatar-utils.mjs';
import { createBodySolver } from '../src/body-solver.ts';
import { parsePhonePacket } from '../src/phone-packet.mjs';

const official = readFileSync(new URL('./fixtures/ifacialmocap-official.txt', import.meta.url), 'utf8');
const recordings = JSON.parse(readFileSync(new URL('./fixtures/mediapipe/observed-results.json', import.meta.url)));
async function load(path, natural = true) {
  const bytes = readFileSync(new URL(path, import.meta.url));
  const loader = new GLTFLoader(); loader.register(parser => new VRMLoaderPlugin(parser));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const vrm = gltf.userData.vrm; VRMUtils.rotateVRM0(vrm);
  if (natural) applyNaturalPose(vrm);
  vrm.scene.updateMatrixWorld(true);
  return vrm;
}
const world = (vrm, name) => vrm.humanoid.getRawBoneNode(name).getWorldPosition(new Vector3());
const sideOfX = x => (x > 0 ? 'left' : 'right');
const update = vrm => { vrm.humanoid.update(); vrm.scene.updateMatrixWorld(true); };

// Channel-name side that means "the subject's own left" under the (device-confirmed) convention.
const L = SOURCE_LEFT_IS_SUBJECT_LEFT ? 'Left' : 'Right', R = SOURCE_LEFT_IS_SUBJECT_LEFT ? 'Right' : 'Left';
const phoneL = L === 'Left' ? '_L' : '_R', phoneR = L === 'Left' ? '_R' : '_L';
// MediaPipe outputs the ARKit names plus `_neutral`; take the real name set from the official phone packet.
const baseScores = Object.fromEntries(parsePhonePacket(official).categories.map(c => [c.categoryName, 0.02]));
const cameraCategories = overrides => [['_neutral', 0], ...Object.entries({ ...baseScores, ...overrides })]
  .map(([categoryName, score], index) => ({ index, score, categoryName, displayName: '' }));
const phonePacket = overrides => official.replace(/([a-zA-Z]+(?:_[LR])?)-(\d+)/g, (field, name) => `${name}-${overrides[name] ?? 2}`);

/** Which eye of the real mascot closes when the motion is applied like main.ts applyMotion. */
function blinkSide(vrm, motion) {
  vrm.expressionManager.setValue('blinkLeft', motion.blinkLeft);
  vrm.expressionManager.setValue('blinkRight', motion.blinkRight);
  vrm.expressionManager.update(); vrm.scene.updateMatrixWorld(true);
  const closed = [];
  vrm.scene.traverse(object => { if (object.isMesh && object.morphTargetInfluences?.[0] > 0.5) closed.push(object); });
  const eyes = closed.filter(mesh => ['leftEye', 'rightEye'].some(bone => mesh.parent === vrm.humanoid.getRawBoneNode(bone) || mesh.parent?.parent === vrm.humanoid.getRawBoneNode(bone)));
  assert.equal(eyes.length, 1, 'exactly one eye closes');
  return sideOfX(eyes[0].getWorldPosition(new Vector3()).x);
}
/** Direction the real mascot's eyes turn when lookAt receives the motion's gaze. */
function gazeSide(vrm, motion) {
  const { yaw, pitch } = gazeAngles(motion);
  vrm.lookAt.autoUpdate = false; vrm.lookAt.yaw = yaw; vrm.lookAt.pitch = pitch; vrm.lookAt.update(0);
  vrm.scene.updateMatrixWorld(true);
  const sides = ['leftEye', 'rightEye'].map(name => {
    const eye = vrm.humanoid.getRawBoneNode(name);
    const rest = new Vector3(0, 0, 1);
    const forward = rest.applyQuaternion(eye.getWorldQuaternion(new Quaternion()));
    return forward.x;
  });
  // VRM 1 eye bones face +Z at rest, so the x component of their forward axis is the gaze side.
  assert.ok(sides.every(x => Math.abs(x) > 0.05) && Math.sign(sides[0]) === Math.sign(sides[1]), `both eyes turn together: ${sides}`);
  return sideOfX(sides[0]);
}
/** Direction the head of a real VRM (0.x or 1.0) faces after the same head path as main.ts. */
function headSide(vrm, latest, neutral, mirror) {
  const head = vrm.humanoid.getNormalizedBoneNode('head');
  const raw = vrm.humanoid.getRawBoneNode('head');
  const rest = head.quaternion.clone();
  const origin = raw.getWorldPosition(new Vector3());
  const probe = origin.clone().add(new Vector3(0, 0, 0.1)).applyMatrix4(new Matrix4().copy(raw.matrixWorld).invert());
  head.quaternion.copy(rest).multiply(vrmRotation(relativeHeadRotation(latest, neutral, 1, mirror), vrm.meta.metaVersion));
  update(vrm);
  const facing = probe.applyMatrix4(raw.matrixWorld).sub(raw.getWorldPosition(new Vector3()));
  head.quaternion.copy(rest); update(vrm);
  assert.ok(Math.abs(facing.x) > 0.02, 'head turns sideways');
  return sideOfX(facing.x);
}
/** Which arm is raised above its shoulder. */
function raisedArm(vrm) {
  const raised = ['left', 'right'].filter(side => world(vrm, side + 'LowerArm').y > world(vrm, side + 'UpperArm').y + 0.1);
  assert.equal(raised.length, 1, `exactly one raised arm: ${raised}`);
  return raised[0];
}

test('avatar side is grounded: VRM leftUpperArm sits at +X in world space', async () => {
  for (const file of ['../public/examples/miao-cat.vrm', './fixtures/minimal-avatar.vrm', './fixtures/minimal-avatar-v0.vrm']) {
    const vrm = await load(file, false);
    assert.equal(sideOfX(world(vrm, 'leftUpperArm').x), 'left', file);
  }
});

for (const mirror of [false, true]) {
  const expected = mirror ? 'right' : 'left';
  test(`mirror=${mirror}: the subject's left eye, gaze, head turn, arm and phone blink all drive the avatar's ${expected} side`, async () => {
    const cat = await load('../public/examples/miao-cat.vrm');
    const face = motion => mirrorFace(solveExpressions(motion), mirror);

    // 1. Camera face path: only the subject's left eye closes.
    const cameraBlink = face(cameraCategories({ [`eyeBlink${L}`]: 0.9 }));
    assert.equal(blinkSide(cat, cameraBlink), expected, 'camera blink');

    // 2. Camera gaze: the subject looks to their own left (left eye out, right eye in).
    const cameraGaze = face(cameraCategories({ [`eyeLookOut${L}`]: 0.8, [`eyeLookIn${R}`]: 0.8 }));
    assert.equal(gazeSide(cat, cameraGaze), expected, 'camera gaze');

    // 3. Head: in MediaPipe's metric camera space +X points to image right, which is the subject's left in an
    //    unmirrored webcam frame; the face turns so its forward axis (+Z, towards the camera) swings towards +X.
    const neutral = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.08);
    const turnLeft = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(Math.sin(0.4), 0, Math.cos(0.4)));
    for (const file of ['./fixtures/minimal-avatar.vrm', './fixtures/minimal-avatar-v0.vrm']) {
      const vrm = await load(file);
      assert.equal(headSide(vrm, turnLeft.clone().multiply(neutral), neutral, mirror), expected, `head ${file}`);
    }

    // 4. Body: the recorded real pose, edited so only the subject's own left arm (MediaPipe 11/13/15) points up
    //    (MediaPipe world y points down) while the right arm hangs down.
    const pose = recordings['pose.jpg'].result.pose.map(p => ({ ...p }));
    const place = (index, from, dy) => { pose[index] = { ...pose[index], x: pose[from].x, y: pose[from].y + dy, z: pose[from].z }; };
    place(13, 11, -0.28); place(15, 13, -0.25); place(14, 12, 0.28); place(16, 14, 0.25);
    for (const file of ['./fixtures/minimal-avatar.vrm', './fixtures/minimal-avatar-v0.vrm']) {
      const vrm = await load(file), solver = createBodySolver(() => vrm, () => mirror);
      for (let i = 0; i < 30; i++) { solver.apply({ pose, hands: [], handedness: [] }, i * 10); update(vrm); }
      assert.equal(raisedArm(vrm), expected, `arm ${file}`);
    }

    // 5. Hands: the official right_hands.jpg shows two real right hands and the model labels them "Right";
    //    the subject's right hand must land opposite to where the subject's left side goes.
    const vrm = await load('./fixtures/minimal-avatar.vrm'), solver = createBodySolver(() => vrm, () => mirror);
    const recorded = recordings['right_hands.jpg'].result;
    const before = side => vrm.humanoid.getNormalizedBoneNode(side + 'IndexProximal').quaternion.clone();
    const rest = { left: before('left'), right: before('right') };
    for (let i = 0; i < 30; i++) { solver.apply({ pose: [], hands: [recorded.hands[0]], handedness: [recorded.handedness[0]] }, i * 10); update(vrm); }
    const moved = ['left', 'right'].filter(side => rest[side].angleTo(vrm.humanoid.getNormalizedBoneNode(side + 'IndexProximal').quaternion) > 0.1);
    assert.deepEqual(moved, [expected === 'left' ? 'right' : 'left'], 'subject right hand');

    // 6. Phone (iFacialMocap official packet format): only eyeBlink_L closes; then only a left gaze.
    const phoneBlink = parsePhonePacket(phonePacket({ [`eyeBlink${phoneL}`]: 90 }));
    assert.equal(blinkSide(cat, face(phoneBlink.categories)), expected, 'phone blink');
    const phoneGaze = parsePhonePacket(phonePacket({ [`eyeLookOut${phoneL}`]: 80, [`eyeLookIn${phoneR}`]: 80 }));
    assert.equal(gazeSide(cat, face(phoneGaze.categories)), expected, 'phone gaze');
  });
}

test('side mapping helpers agree with each other and reverse with the mirror switch', () => {
  for (const mirror of [false, true]) {
    assert.notEqual(avatarSide('left', mirror), avatarSide('right', mirror));
    assert.equal(mapSide(SOURCE_LEFT_IS_SUBJECT_LEFT ? 'left' : 'right', mirror), avatarSide('left', mirror));
  }
  assert.notEqual(avatarSide('left', true), avatarSide('left', false));
});
