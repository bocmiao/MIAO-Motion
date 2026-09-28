import * as THREE from 'three';

const textureProperties = [
  'map', 'normalMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap',
  'roughnessMap', 'metalnessMap', 'shadeMultiplyTexture', 'shadingShiftTexture',
  'matcapTexture', 'rimMultiplyTexture', 'outlineWidthMultiplyTexture', 'uvAnimationMaskTexture',
];

const addTexture = (textures, value) => {
  if (value?.isTexture) textures.add(value);
};

export function collectModelMetrics(root, fileBytes) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  let triangles = 0;

  root.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    const multiplier = object.isInstancedMesh ? object.count : 1;
    const vertexCount = object.geometry.index?.count ?? object.geometry.getAttribute('position')?.count ?? 0;
    triangles += Math.round(vertexCount / 3) * multiplier;
    geometries.add(object.geometry);
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    meshMaterials.filter(Boolean).forEach((material) => {
      materials.add(material);
      textureProperties.forEach((property) => addTexture(textures, material[property]));
      Object.values(material).forEach((value) => addTexture(textures, value));
      Object.values(material.uniforms ?? {}).forEach((uniform) => addTexture(textures, uniform?.value));
    });
  });

  let geometryBytes = 0;
  geometries.forEach((geometry) => {
    Object.values(geometry.attributes).forEach((attribute) => { geometryBytes += attribute.array.byteLength; });
    Object.values(geometry.morphAttributes).flat().forEach((attribute) => { geometryBytes += attribute.array.byteLength; });
    if (geometry.index) geometryBytes += geometry.index.array.byteLength;
  });

  let textureBytes = 0;
  let maxTextureSize = 0;
  textures.forEach((texture) => {
    const image = texture.image;
    const width = image?.naturalWidth ?? image?.videoWidth ?? image?.width ?? 0;
    const height = image?.naturalHeight ?? image?.videoHeight ?? image?.height ?? 0;
    maxTextureSize = Math.max(maxTextureSize, width, height);
    textureBytes += Math.round(width * height * 4 * 4 / 3);
  });

  return { fileBytes, triangles, materials: materials.size, textures: textures.size, maxTextureSize, textureBytes, geometryBytes };
}

export function mirrorMotion(motion, enabled) {
  if (enabled) return { ...motion };
  return {
    ...motion,
    blinkLeft: motion.blinkRight,
    blinkRight: motion.blinkLeft,
    lookLeft: motion.lookRight,
    lookRight: motion.lookLeft,
  };
}

export function gazeAngles(motion) {
  return {
    yaw: THREE.MathUtils.clamp((motion.lookLeft - motion.lookRight) * 30, -30, 30),
    pitch: THREE.MathUtils.clamp((motion.lookDown - motion.lookUp) * 20, -20, 20),
  };
}

export function relativeHeadRotation(current, neutral, sensitivity, mirrorEnabled) {
  const relative = neutral.clone().invert().multiply(current);
  const euler = new THREE.Euler().setFromQuaternion(relative, 'YXZ');
  euler.set(
    THREE.MathUtils.clamp(euler.x * sensitivity, -0.65, 0.65),
    THREE.MathUtils.clamp(euler.y * sensitivity * (mirrorEnabled ? -1 : 1), -0.85, 0.85),
    THREE.MathUtils.clamp(euler.z * sensitivity * (mirrorEnabled ? -1 : 1), -0.5, 0.5),
    'YXZ',
  );
  return new THREE.Quaternion().setFromEuler(euler);
}

export function idleBlink(elapsedMs) {
  const phase = (Math.max(0, elapsedMs) + 1_700) % 4_200;
  if (phase >= 180) return 0;
  return phase < 75 ? phase / 75 : 1 - (phase - 75) / 105;
}

// VRM 0 normalized bones face -Z; VRM 1 faces +Z. Convert after mirroring.
export function vrmRotation(rotation, metaVersion) {
  const result = rotation.clone();
  if (metaVersion === '0') { result.x *= -1; result.z *= -1; }
  return result;
}

export function applyNaturalPose(vrm) {
  for (const [name, degrees] of [['leftUpperArm', -72], ['rightUpperArm', 72], ['leftLowerArm', -8], ['rightLowerArm', 8]]) {
    const bone = vrm.humanoid.getNormalizedBoneNode(name);
    if (bone) bone.quaternion.multiply(vrmRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Number(degrees) * Math.PI / 180), vrm.meta.metaVersion));
  }
  vrm.humanoid.update();
  vrm.scene.updateMatrixWorld(true);
  vrm.springBoneManager?.setInitState();
}

export function frameAvatar(vrm, camera, target, preset = 'upper') {
  vrm.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(vrm.scene);
  const head = vrm.humanoid.getRawBoneNode('head')?.getWorldPosition(new THREE.Vector3()) ?? bounds.getCenter(new THREE.Vector3());
  const foot = Math.min(...['leftFoot', 'rightFoot'].map(name => vrm.humanoid.getRawBoneNode(name)?.getWorldPosition(new THREE.Vector3()).y ?? bounds.min.y));
  const height = Math.max(head.y - foot, 0.5);
  const visibleHeight = height * (preset === 'head' ? 0.48 : preset === 'upper' ? 0.95 : 1.5);
  const targetY = head.y - height * (preset === 'head' ? 0 : preset === 'upper' ? 0.22 : 0.43);
  // Use both vertical and horizontal FOV so portrait views do not crop the head.
  const distance = visibleHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * Math.max(1, 0.65 / camera.aspect);
  target.set(head.x, targetY, head.z);
  camera.position.set(head.x, targetY, head.z + distance);
  camera.near = Math.max(height / 100, 0.01);
  camera.far = Math.max(height * 100, 100);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}
