import { SphereGeometry, ConeGeometry, Matrix4, Vector3, Quaternion } from 'three';
import { mkdirSync, writeFileSync } from 'node:fs';

// Original procedural mascot. All geometry is generated here; no third-party avatar data.
const nodes = [], meshes = [], views = [], accessors = [], chunks = [];
let length = 0;
const materials = [
  ['奶油色毛发', [0.94, 0.84, 0.65, 1]], ['深青色衣服', [0.035, 0.32, 0.32, 1]],
  ['面部深色', [0.035, 0.035, 0.055, 1]], ['耳朵内侧', [1, 0.50, 0.48, 1]],
  ['徽章与袖口', [1, 0.63, 0.12, 1]], ['眼白', [1, 0.98, 0.9, 1]],
].map(([name, color]) => ({ name, doubleSided: true, pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: 0, roughnessFactor: 0.85 } }));
function attribute(array, type, bounds = false) {
  const data = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  views.push({ buffer: 0, byteOffset: length, byteLength: data.length, target: 34962 });
  chunks.push(data); length += data.length;
  const item = { bufferView: views.length - 1, componentType: 5126, count: array.length / 3, type };
  if (bounds) {
    item.min = [Infinity, Infinity, Infinity]; item.max = [-Infinity, -Infinity, -Infinity];
    array.forEach((value, i) => { item.min[i % 3] = Math.min(item.min[i % 3], value); item.max[i % 3] = Math.max(item.max[i % 3], value); });
  }
  accessors.push(item); return accessors.length - 1;
}
function node(name, position, parent) {
  // glTF forbids empty arrays, so `children` only exists once a node has one.
  const id = nodes.length; nodes.push({ name, translation: position });
  if (parent !== undefined) (nodes[parent].children ??= []).push(id);
  return id;
}
function shape(parent, name, position, scale, material, kind = 'sphere', morphs = []) {
  const geometry = (kind === 'cone' ? new ConeGeometry(1, 2, 3) : new SphereGeometry(1, 18, 12)).toNonIndexed();
  geometry.applyMatrix4(new Matrix4().compose(new Vector3(), new Quaternion(), new Vector3(...scale)));
  const vertices = geometry.getAttribute('position').array;
  const primitive = { attributes: { POSITION: attribute(vertices, 'VEC3', true), NORMAL: attribute(geometry.getAttribute('normal').array, 'VEC3') }, material };
  if (morphs.length) primitive.targets = morphs.map(transform => {
    const delta = new Float32Array(vertices.length);
    for (let i = 0; i < vertices.length; i += 3) {
      const target = transform(vertices[i], vertices[i + 1], vertices[i + 2]);
      delta[i] = target[0] - vertices[i]; delta[i + 1] = target[1] - vertices[i + 1]; delta[i + 2] = target[2] - vertices[i + 2];
    }
    // Morph target POSITION accessors must declare min/max as well (glTF 2.0 §3.7.2.1).
    return { POSITION: attribute(delta, 'VEC3', true) };
  });
  const mesh = meshes.length; meshes.push({ name, primitives: [primitive], ...(morphs.length ? { weights: morphs.map(() => 0) } : {}) });
  const id = node(name, position, parent); nodes[id].mesh = mesh;
  geometry.dispose(); return id;
}
const bones = {};
const bone = (name, xyz, parent) => { bones[name] = { node: node(name, xyz, parent) }; return bones[name].node; };
const hips = bone('hips', [0, 0.66, 0]);
const spine = bone('spine', [0, 0.13, 0], hips);
const chest = bone('chest', [0, 0.16, 0], spine);
const neck = bone('neck', [0, 0.12, 0], chest);
const head = bone('head', [0, 0.17, 0], neck);
shape(hips, '裤子', [0, 0, 0], [0.18, 0.14, 0.13], 1);
shape(spine, '上衣', [0, 0.035, 0], [0.20, 0.23, 0.14], 1);
const part = (category, choice, parent, visible = true) => {
  const id = node(`miao_part_${category}_${choice}`, [0,0,0], parent);
  nodes[id].scale = visible ? [1,1,1] : [0,0,0]; return id;
};
const badge = part('clothes', 'badge', chest), hoodie = part('clothes', 'hoodie', chest, false);
shape(badge, '领口', [0, 0.05, 0.09], [0.115, 0.035, 0.07], 4);
shape(badge, '圆形徽章', [-0.085, -0.015, 0.139], [0.033, 0.033, 0.012], 4);
shape(hoodie, '兜帽', [0,0.09,-0.055], [0.18,0.11,0.13], 1);
shape(hoodie, '帽绳左', [-0.055,0.012,0.14], [0.009,0.075,0.01], 4);
shape(hoodie, '帽绳右', [0.055,0.012,0.14], [0.009,0.075,0.01], 4);
shape(head, '猫咪头部', [0, 0.035, 0], [0.27, 0.23, 0.22], 0);
const pointed = part('ears', 'pointed', head), round = part('ears', 'round', head, false);
for (const sign of [-1, 1]) {
  shape(pointed, `尖耳${sign}`, [sign*0.18,0.25,0], [0.105,0.13,0.07], 0, 'cone');
  shape(pointed, `尖内耳${sign}`, [sign*0.18,0.25,0.045], [0.065,0.085,0.012], 3, 'cone');
  shape(round, `圆耳${sign}`, [sign*0.205,0.22,0], [0.09,0.105,0.06], 0);
  shape(round, `圆内耳${sign}`, [sign*0.205,0.22,0.045], [0.052,0.067,0.012], 3);
}
const longTail = part('tail', 'long', hips), shortTail = part('tail', 'short', hips, false);
shape(longTail, '长尾根', [0.16,-0.025,-0.16], [0.11,0.055,0.13], 0);
shape(longTail, '长尾尖', [0.255,0.07,-0.22], [0.06,0.16,0.06], 0);
shape(shortTail, '短尾球', [0.12,-0.005,-0.17], [0.085,0.085,0.10], 0);
const tuft = part('hair', 'tuft', head); part('hair', 'smooth', head, false);
shape(tuft, '头顶发簇', [0,0.25,0.095], [0.073,0.071,0.048], 0, 'cone');
const blink = (x,y,z) => [x, y * 0.08, z];
const eyeNodes = [], browNodes = [];
for (const [side, sign] of [['left', 1], ['right', -1]]) {
  const eye = bone(`${side}Eye`, [0.09 * sign, 0.065, 0.196], head);
  eyeNodes.push(shape(eye, `${side}瞳孔`, [0,0,0], [0.029, 0.049, 0.027], 2, 'sphere', [blink]));
  shape(eye, `${side}高光`, [-0.007, 0.02, 0.024], [0.008, 0.009, 0.006], 5);
  browNodes.push(shape(head, `${side}眉毛`, [0.09*sign,0.135,0.19], [0.048,0.009,0.012], 2, 'sphere',
    [(x,y,z)=>[x,y+x*sign*0.5,z], (x,y,z)=>[x,y-x*sign*0.5,z]]));
  const upperArm = bone(`${side}UpperArm`, [sign * 0.20, 0.03, 0], chest);
  const lowerArm = bone(`${side}LowerArm`, [sign * 0.20, 0, 0], upperArm);
  const hand = bone(`${side}Hand`, [sign * 0.18, 0, 0], lowerArm);
  shape(upperArm, `${side}袖子`, [sign * 0.10,0,0], [0.13,0.071,0.075],1);
  shape(lowerArm, `${side}手臂`, [sign * 0.08,0,0], [0.12,0.061,0.065],0);
  shape(hand, `${side}猫爪`, [sign * 0.025,0,0], [0.073,0.066,0.071],0);
  const upperLeg = bone(`${side}UpperLeg`, [sign * 0.095,-0.04,0], hips);
  const lowerLeg = bone(`${side}LowerLeg`, [0,-0.25,0], upperLeg);
  const foot = bone(`${side}Foot`, [0,-0.25,0], lowerLeg);
  shape(upperLeg, `${side}裤腿`, [0,-0.12,0], [0.082,0.16,0.087],1);
  shape(lowerLeg, `${side}小腿`, [0,-0.10,0], [0.063,0.15,0.065],0);
  shape(foot, `${side}鞋子`, [0,-0.015,0.055], [0.08,0.059,0.12],1);
}
shape(head, '鼻子', [0,0.015,0.22], [0.021,0.015,0.018],3);
const mouth = shape(head, '嘴巴', [0,-0.048,0.208], [0.043,0.012,0.016],2,'sphere',[(x,y,z)=>[x,y*5,z],(x,y,z)=>[x*1.2,y+x*x*12,z],(x,y,z)=>[x,y-x*x*12,z]]);
const bind = (node,index) => ({ node,index,weight:1 });
const preset = {
  blinkLeft: { morphTargetBinds:[bind(eyeNodes[0],0)] }, blinkRight:{ morphTargetBinds:[bind(eyeNodes[1],0)] },
  aa:{ morphTargetBinds:[bind(mouth,0)] }, oh:{ morphTargetBinds:[bind(mouth,0)] }, happy:{ morphTargetBinds:[bind(mouth,1)] },
  sad:{ morphTargetBinds:[bind(mouth,2),...browNodes.map(n=>bind(n,1))] }, angry:{ morphTargetBinds:browNodes.map(n=>bind(n,0)) }, relaxed:{ morphTargetBinds:eyeNodes.map(n=>({...bind(n,0),weight:0.5})) }, surprised:{ morphTargetBinds:[bind(mouth,0)] },
};
const range = { inputMaxValue:90,outputScale:12 };
const gltf = { asset:{version:'2.0',generator:'MIAO Motion original procedural mascot'},scene:0,scenes:[{nodes:[hips]}], nodes, meshes, materials, bufferViews:views, accessors, buffers:[{byteLength:length}],extensionsUsed:['VRMC_vrm'],extensions:{VRMC_vrm:{specVersion:'1.0',meta:{name:'喵小动 · 原创猫咪',version:'1',authors:['MIAO Motion contributors'],copyrightInformation:'Original procedural geometry; source in scripts/generate-miao-avatar.mjs',licenseUrl:'https://vrm.dev/licenses/1.0/',avatarPermission:'everyone',commercialUsage:'corporation',creditNotation:'unnecessary',allowRedistribution:true,modification:'allowModificationRedistribution',allowExcessivelyViolentUsage:false,allowExcessivelySexualUsage:false,allowPoliticalOrReligiousUsage:false,allowAntisocialOrHateUsage:false},humanoid:{humanBones:bones},expressions:{preset},lookAt:{type:'bone',offsetFromHeadBone:[0,0.065,0.2],rangeMapHorizontalInner:range,rangeMapHorizontalOuter:range,rangeMapVerticalDown:range,rangeMapVerticalUp:range}}}};
const source = Buffer.from(JSON.stringify(gltf));
const json = Buffer.concat([source,Buffer.alloc((4-source.length%4)%4,0x20)]);
const binary = Buffer.concat(chunks);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);
const jsonHeader=Buffer.alloc(8);jsonHeader.writeUInt32LE(json.length);jsonHeader.writeUInt32LE(0x4e4f534a,4);
const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(binary.length);binHeader.writeUInt32LE(0x004e4942,4);
mkdirSync('public/examples',{recursive:true});writeFileSync('public/examples/miao-cat.vrm',Buffer.concat([header,jsonHeader,json,binHeader,binary]));
console.log('已生成原创猫咪示例（可重新生成，无第三方角色素材）');
