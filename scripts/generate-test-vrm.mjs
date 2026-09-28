import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = resolve(root, 'tests/fixtures');
mkdirSync(fixtureDir, { recursive: true });

const nodeNames = [
  'hips', 'spine', 'chest', 'neck', 'leftUpperArm', 'leftLowerArm', 'rightUpperArm', 'rightLowerArm',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'head', 'leftHand', 'rightHand',
];
const nodes = nodeNames.map((name) => ({ name, translation: [0, 0.1, 0] }));
nodes[0].translation = [0, 0.9, 0];
nodes[1].translation = [0, 0.2, 0];
nodes[2].translation = [0, 0.2, 0];
nodes[14].translation = [0, 0.2, 0];
for (const [index, x, y] of [[4, 0.15, 0], [5, 0.3, 0], [15, 0.25, 0], [6, -0.15, 0], [7, -0.3, 0], [16, -0.25, 0], [8, 0.1, -0.1], [9, 0, -0.4], [10, 0, -0.4], [11, -0.1, -0.1], [12, 0, -0.4], [13, 0, -0.4]]) nodes[index].translation = [x, y, 0];
nodes[0].children = [1, 8, 11];
nodes[1].children = [2];
nodes[2].children = [3, 4, 6];
nodes[3].children = [14];
nodes[4].children = [5];
nodes[5].children = [15];
nodes[6].children = [7];
nodes[7].children = [16];
nodes[8].children = [9];
nodes[9].children = [10];
nodes[11].children = [12];
nodes[12].children = [13];
nodes[14].mesh = 0;

const positions = new Float32Array([-0.3, -0.2, 0, 0.3, -0.2, 0, 0.3, 0.3, 0, -0.3, -0.2, 0, 0.3, 0.3, 0, -0.3, 0.3, 0]);
const binary = Buffer.from(positions.buffer);
const humanBones = Object.fromEntries(nodeNames.map((name, node) => [name, { node }]));
const gltf = {
  asset: { version: '2.0', generator: 'MIAO Motion project-owned test fixture' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes,
  buffers: [{ byteLength: binary.length }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binary.length, target: 34962 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 6, type: 'VEC3', min: [-0.3, -0.2, 0], max: [0.3, 0.3, 0] }],
  materials: [{ doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.8, 0.1, 0.2, 1], metallicFactor: 0 } }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 4, material: 0 }] }],
  extensionsUsed: ['VRMC_vrm'],
  extensions: {
    VRMC_vrm: {
      specVersion: '1.0',
      meta: {
        name: 'MIAO Motion Minimal Test Avatar', authors: ['MIAO Motion contributors'],
        licenseUrl: 'https://vrm.dev/licenses/1.0/', avatarPermission: 'everyone', commercialUsage: 'corporation',
        creditNotation: 'unnecessary', allowRedistribution: true, modification: 'allowModificationRedistribution',
        allowExcessivelyViolentUsage: false, allowExcessivelySexualUsage: false,
        allowPoliticalOrReligiousUsage: false, allowAntisocialOrHateUsage: false,
      },
      humanoid: { humanBones },
    },
  },
};

function writeGlb(name, gltf) {
const jsonSource = JSON.stringify(gltf);
const jsonPadding = (4 - Buffer.byteLength(jsonSource) % 4) % 4;
const json = Buffer.from(`${jsonSource}${' '.repeat(jsonPadding)}`);
const binaryPadding = (4 - binary.length % 4) % 4;
const bin = Buffer.concat([binary, Buffer.alloc(binaryPadding)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(json.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(bin.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4);

writeFileSync(resolve(fixtureDir, name), Buffer.concat([header, jsonHeader, json, binHeader, bin]));
}
writeGlb('minimal-avatar.vrm', gltf);
const vrm0 = structuredClone(gltf);
vrm0.nodes.forEach(node => { node.translation[0] *= -1; });
vrm0.extensionsUsed = ['VRM'];
vrm0.extensions = { VRM: { specVersion: '0.0', meta: { title: 'MIAO VRM0 test fixture', version: '1', author: 'MIAO Motion contributors', allowedUserName: 'Everyone', licenseName: 'CC0' }, humanoid: { humanBones: nodeNames.map((bone, node) => ({ bone, node, useDefaultValues: true })) } } };
writeGlb('minimal-avatar-v0.vrm', vrm0);
writeFileSync(resolve(fixtureDir, 'corrupt-avatar.vrm'), 'This is intentionally not a GLB/VRM file.\n');
