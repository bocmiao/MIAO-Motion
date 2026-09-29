import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { Vector3 } from 'three';
import { createBodySolver } from '../src/body-solver.ts';
import { applyNaturalPose } from '../src/avatar-utils.mjs';
const recordings = JSON.parse(readFileSync(new URL('./fixtures/mediapipe/observed-results.json',import.meta.url)));
async function avatar(version) {
  const bytes=readFileSync(new URL('./fixtures/minimal-avatar'+(version==='0'?'-v0':'')+'.vrm',import.meta.url));
  const loader=new GLTFLoader();loader.register(parser=>new VRMLoaderPlugin(parser));
  const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const vrm=gltf.userData.vrm;VRMUtils.rotateVRM0(vrm);applyNaturalPose(vrm);return vrm;
}
const world=(vrm,name)=>vrm.humanoid.getRawBoneNode(name).getWorldPosition(new Vector3());
const update=vrm=>{vrm.humanoid.update();vrm.scene.updateMatrixWorld(true);};
for(const version of ['0','1'])for(const mirror of [false,true]) {
  test(`real pose output → VRM ${version}, mirror=${mirror}: both raw arms point in expected screen direction`,async()=>{
    const vrm=await avatar(version),solver=createBodySolver(()=>vrm,()=>mirror);
    const result=recordings['pose.jpg'].result;
    for(let i=0;i<30;i++){solver.apply({...result,hands:[],handedness:[]},i*10);update(vrm);}
    for(const [source,a,b]of [['left',11,13],['right',12,14]]) {
      const side=mirror?(source==='left'?'right':'left'):source;
      const p=result.pose[a],q=result.pose[b];
      const expected=new Vector3((q.x-p.x)*(mirror?-1:1),p.y-q.y,p.z-q.z).normalize();
      const actual=world(vrm,side+'LowerArm').sub(world(vrm,side+'UpperArm')).normalize();
      assert.ok(actual.dot(expected)>0.97,`${side}: raw world dot=${actual.dot(expected)}`);
    }
  });
  test(`real hand output with visibility=0 moves fingers in VRM ${version}, mirror=${mirror}`,async()=>{
    const vrm=await avatar(version),solver=createBodySolver(()=>vrm,()=>mirror);
    const recorded=recordings['right_hands.jpg'].result;
    const result={pose:[],hands:[recorded.hands[0]],handedness:[recorded.handedness[0]]};
    assert.ok(result.hands[0].every(p=>p.visibility===0));
    const source=result.handedness[0][0].categoryName.toLowerCase();
    const side=mirror?(source==='left'?'right':'left'):source;
    const name=side+'IndexProximal',before=vrm.humanoid.getNormalizedBoneNode(name).quaternion.clone();
    for(let i=0;i<30;i++){solver.apply(result,i*10);update(vrm);}
    assert.ok(before.angleTo(vrm.humanoid.getNormalizedBoneNode(name).quaternion)>0.1);
    const p=result.hands[0][5],q=result.hands[0][6];
    const expected=new Vector3((q.x-p.x)*(mirror?-1:1),p.y-q.y,p.z-q.z).normalize();
    const actual=world(vrm,side+'IndexIntermediate').sub(world(vrm,name)).normalize();
    assert.ok(actual.dot(expected)>0.97);
    solver.reset();update(vrm);
    assert.ok(before.angleTo(vrm.humanoid.getNormalizedBoneNode(name).quaternion)<1e-6);
  });
}
