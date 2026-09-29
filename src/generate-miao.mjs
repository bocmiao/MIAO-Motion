// @ts-nocheck
import { SphereGeometry, ConeGeometry, Matrix4, Vector3, Quaternion, Color } from 'three';
import { normalizeCharacter } from './character-spec.ts';

export function generateMiao(input = {}) {
const config = normalizeCharacter(input);

// Original procedural mascot. All geometry is generated here; no third-party avatar data.
const parents = [];
const nodes = [], meshes = [], views = [], accessors = [], chunks = [];
let length = 0;
const materials = [
  ['奶油色毛发', [0.94, 0.84, 0.65, 1]], ['深青色衣服', [0.035, 0.32, 0.32, 1]],
  ['面部深色', [0.035, 0.035, 0.055, 1]], ['耳朵内侧', [1, 0.50, 0.48, 1]],
  ['徽章与袖口', [1, 0.63, 0.12, 1]], ['眼白', [1, 0.98, 0.9, 1]],
].map(([name, color], i) => ({ name, doubleSided: true, pbrMetallicRoughness: { baseColorFactor: i === 0 ? [...new Color(config.colors.fur).toArray(),1] : i === 1 ? [...new Color(config.colors.outfit).toArray(),1] : i === 4 ? [...new Color(config.colors.accent).toArray(),1] : color, metallicFactor: 0, roughnessFactor: 0.85 } }));
function attribute(array, type, bounds = false, componentType = 5126) {
  const data = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  views.push({ buffer: 0, byteOffset: length, byteLength: data.length, target: 34962 });
  chunks.push(data); length += data.length;
  const item = { bufferView: views.length - 1, componentType, count: array.length / ({VEC3:3,VEC4:4,MAT4:16}[type] ?? 3), type };
  if (bounds) {
    item.min = [Infinity, Infinity, Infinity]; item.max = [-Infinity, -Infinity, -Infinity];
    array.forEach((value, i) => { item.min[i % 3] = Math.min(item.min[i % 3], value); item.max[i % 3] = Math.max(item.max[i % 3], value); });
  }
  accessors.push(item); return accessors.length - 1;
}
function node(name, position, parent) {
  // glTF forbids empty arrays, so `children` only exists once a node has one.
  const id = nodes.length; parents[id] = parent; nodes.push({ name, translation: position });
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
materials.push({ name: '瞳孔', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [...new Color(config.colors.eyes).toArray(),1], metallicFactor:0, roughnessFactor:0.7 } });
const bones = {};
const bone = (name, xyz, parent) => { bones[name] = { node: node(name, xyz, parent) }; return bones[name].node; };
const hips = bone('hips', [0, 0.66, 0]);
const spine = bone('spine', [0, 0.13, 0], hips);
const chest = bone('chest', [0, 0.16, 0], spine);
const neck = bone('neck', [0, 0.12, 0], chest);
const head = bone('head', [0, 0.17, 0], neck);
nodes[head].scale = [config.proportions.head,config.proportions.head,config.proportions.head];
shape(hips, '裤子', [0, 0, 0], [0.18*config.proportions.width, 0.14, 0.13], 1);
shape(spine, '上衣', [0, 0.035, 0], [0.20*config.proportions.width, 0.23, 0.14], 1);
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
// Additional parts share the same bone anchors and rounded silhouette.
const tall = part('ears','tall',head,false), folded = part('ears','folded',head,false);
for (const sign of [-1,1]) {
  shape(tall,'高耳',[sign*0.18,0.30,0],[0.075,0.18,0.065],0,'cone');
  shape(tall,'高内耳',[sign*0.18,0.30,0.044],[0.045,0.12,0.012],3,'cone');
  shape(folded,'折耳',[sign*0.235,0.18,0.01],[0.12,0.065,0.10],0);
  shape(folded,'折内耳',[sign*0.235,0.18,0.085],[0.07,0.035,0.012],3);
}
const fluffy=part('tail','fluffy',hips,false), curled=part('tail','curled',hips,false);
shape(fluffy,'蓬松尾',[0.23,0.04,-0.22],[0.12,0.21,0.11],0);
for(let i=0;i<6;i++) { const t=i*Math.PI/6; shape(curled,'卷尾'+i,[0.18+Math.sin(t)*0.12,0.02+Math.cos(t)*0.12,-0.20],[0.055,0.055,0.065],0); }
const sideHair=part('hair','side',head,false), doubleHair=part('hair','double',head,false);
shape(sideHair,'侧刘海',[-0.11,0.22,0.13],[0.14,0.065,0.08],0);
for(const sign of [-1,1]) shape(doubleHair,'双发簇',[sign*0.07,0.25,0.08],[0.065,0.09,0.055],0,'cone');
const scarf=part('clothes','scarf',chest,false), bow=part('clothes','bow',chest,false);
shape(scarf,'围巾领',[0,0.07,0.03],[0.14,0.04,0.13],4);
shape(scarf,'围巾尾',[-0.07,-0.03,0.16],[0.035,0.13,0.025],4);
for(const sign of [-1,1]) shape(bow,'蝴蝶结',[sign*0.055,0.035,0.13],[0.06,0.04,0.03],4);
shape(bow,'蝴蝶结心',[0,0.035,0.15],[0.025,0.025,0.025],3);
const blink = (x,y,z) => [x, y * 0.08, z];
const eyeNodes = [], browNodes = [];
for (const [side, sign] of [['left', 1], ['right', -1]]) {
  const eye = bone(`${side}Eye`, [0.09 * sign, 0.065, 0.196], head);
  eyeNodes.push(shape(eye, `${side}瞳孔`, [0,0,0], [0.029*config.face.eyeSize, (config.face.eyeShape === 'round' ? 0.033 : config.face.eyeShape === 'gentle' ? 0.024 : 0.049)*config.face.eyeSize, 0.027], 6, 'sphere', [blink]));
  shape(eye, `${side}高光`, [-0.007, 0.02, 0.024], [0.008, 0.009, 0.006], 5);
  browNodes.push(shape(head, `${side}眉毛`, [0.09*sign,0.135,0.19], [config.face.brows === 'short' ? 0.03 : 0.048,config.face.brows === 'bold' ? 0.015 : 0.009,0.012], 2, 'sphere',
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
const mouth = shape(head, '嘴巴', [0,-0.048,0.208], [config.face.mouth === 'small' ? 0.028 : 0.043,config.face.mouth === 'open' ? 0.021 : 0.012,0.016],2,'sphere',[(x,y,z)=>[x,y*5,z],(x,y,z)=>[x*1.2,y+x*x*12,z],(x,y,z)=>[x,y-x*x*12,z]]);
const bind = (node,index) => ({ node,index,weight:1 });
const preset = {
  blinkLeft: { morphTargetBinds:[bind(eyeNodes[0],0)] }, blinkRight:{ morphTargetBinds:[bind(eyeNodes[1],0)] },
  aa:{ morphTargetBinds:[bind(mouth,0)] }, oh:{ morphTargetBinds:[bind(mouth,0)] }, happy:{ morphTargetBinds:[bind(mouth,1)] },
  sad:{ morphTargetBinds:[bind(mouth,2),...browNodes.map(n=>bind(n,1))] }, angry:{ morphTargetBinds:browNodes.map(n=>bind(n,0)) }, relaxed:{ morphTargetBinds:eyeNodes.map(n=>({...bind(n,0),weight:0.5})) }, surprised:{ morphTargetBinds:[bind(mouth,0)] },
};
const range = { inputMaxValue:90,outputScale:12 };
const gltf = { asset:{version:'2.0',generator:'MIAO Motion original procedural mascot'},scene:0,scenes:[{nodes:[hips]}], nodes, meshes, materials, bufferViews:views, accessors, buffers:[{byteLength:length}],extensionsUsed:['VRMC_vrm'],extensions:{VRMC_vrm:{specVersion:'1.0',meta:{name:'喵小动 · 原创猫咪',version:'1',authors:['MIAO Motion contributors'],copyrightInformation:'Original procedural geometry; source in scripts/generate-miao-avatar.mjs',licenseUrl:'https://vrm.dev/licenses/1.0/',avatarPermission:'everyone',commercialUsage:'corporation',creditNotation:'unnecessary',allowRedistribution:true,modification:'allowModificationRedistribution',allowExcessivelyViolentUsage:false,allowExcessivelySexualUsage:false,allowPoliticalOrReligiousUsage:false,allowAntisocialOrHateUsage:false},humanoid:{humanBones:bones},expressions:{preset},lookAt:{type:'bone',offsetFromHeadBone:[0,0.065,0.2],rangeMapHorizontalInner:range,rangeMapHorizontalOuter:range,rangeMapVerticalDown:range,rangeMapVerticalUp:range}}}};
for (const [category, choice] of Object.entries(config.parts)) for (const n of nodes) {
  if (n.name?.startsWith('miao_part_'+category+'_')) n.scale = n.name === 'miao_part_'+category+'_'+choice ? [1,1,1] : [0,0,0];
}
gltf.extensions.VRMC_vrm.meta.name = config.name;
gltf.extras = { miaoCharacter: config };
// Skin the limbs in world space. Facial/accessory meshes remain attached to their anchors,
// so legacy part switching and expression morph targets remain independently editable.
const joints = Object.values(bones).map(b => b.node);
const worldMatrix = id => { const n=nodes[id]; const m=new Matrix4().compose(new Vector3(...n.translation),new Quaternion(),new Vector3(...(n.scale ?? [1,1,1]))); return parents[id] === undefined ? m : worldMatrix(parents[id]).multiply(m); };
const inverseBind = new Float32Array(joints.length*16);
joints.forEach((id,i)=>worldMatrix(id).invert().toArray(inverseBind,i*16));
const skin = { joints, inverseBindMatrices: attribute(inverseBind,'MAT4') };
delete views[accessors[skin.inverseBindMatrices].bufferView].target;
gltf.skins = [skin];
for (let id=0;id<nodes.length;id++) {
  const n=nodes[id], parent=parents[id];
  if (n.mesh === undefined || parent === undefined || !/UpperArm|LowerArm|Hand|UpperLeg|LowerLeg|Foot$/.test(nodes[parent].name)) continue;
  const primitive=meshes[n.mesh].primitives[0], pos=accessors[primitive.attributes.POSITION];
  const data=chunks[pos.bufferView]; const vertices=new Float32Array(data.buffer,data.byteOffset,data.byteLength/4);
  const matrix=worldMatrix(id), point=new Vector3();
  const joint=joints.indexOf(parent);
  const child=(nodes[parent].children ?? []).find(c=>joints.includes(c));
  const childJoint=child === undefined ? joint : joints.indexOf(child);
  const start=new Vector3().setFromMatrixPosition(worldMatrix(parent));
  const end=child === undefined ? start.clone() : new Vector3().setFromMatrixPosition(worldMatrix(child));
  const axis=end.clone().sub(start), axisLength=axis.lengthSq();
  const indices=new Uint16Array(pos.count*4), weights=new Float32Array(pos.count*4);
  pos.min=[Infinity,Infinity,Infinity];pos.max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<pos.count;i++) {
    point.fromArray(vertices,i*3).applyMatrix4(matrix).toArray(vertices,i*3);
    const blend=axisLength ? Math.max(0,Math.min(0.5,(point.clone().sub(start).dot(axis)/axisLength-0.65)/0.7)) : 0;
    indices.set([joint,childJoint,0,0],i*4);weights.set([1-blend,blend,0,0],i*4);
    for(let a=0;a<3;a++) { pos.min[a]=Math.min(pos.min[a],vertices[i*3+a]);pos.max[a]=Math.max(pos.max[a],vertices[i*3+a]); }
  }
  primitive.attributes.JOINTS_0=attribute(indices,'VEC4',false,5123);
  primitive.attributes.WEIGHTS_0=attribute(weights,'VEC4');
  nodes[parent].children=nodes[parent].children.filter(c=>c!==id);
  if(!nodes[parent].children.length) delete nodes[parent].children;
  n.translation=[0,0,0];n.skin=0;gltf.scenes[0].nodes.push(id);
}
gltf.buffers[0].byteLength=length;
const source = new TextEncoder().encode(JSON.stringify(gltf));
const jsonLength=Math.ceil(source.length/4)*4;
const output=new Uint8Array(28+jsonLength+length), header=new DataView(output.buffer);
header.setUint32(0,0x46546c67,true);header.setUint32(4,2,true);header.setUint32(8,output.length,true);
header.setUint32(12,jsonLength,true);header.setUint32(16,0x4e4f534a,true);
output.fill(0x20,20,20+jsonLength);output.set(source,20);
header.setUint32(20+jsonLength,length,true);header.setUint32(24+jsonLength,0x004e4942,true);
let offset=28+jsonLength;for(const chunk of chunks) { output.set(chunk,offset);offset+=chunk.length; }
return output;
}
