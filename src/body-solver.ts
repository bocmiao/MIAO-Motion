import { Quaternion, Vector3 } from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import type { Landmark, Category } from '@mediapipe/tasks-vision';
import { avatarSide, lateralSign } from './mirror.mjs';
export type BodyResult = { pose: Landmark[]; hands: Landmark[][]; handedness: Category[][] };

export function createBodySolver(avatar: () => VRM | null, mirror: () => boolean) {
  const rests = new Map<string, Quaternion>(), seen = new Map<string, number>();
  // aim() 每帧对每根骨骼调用：复用临时对象，避免高频 new 带来的 GC 压力。
  const tmpTarget = new Vector3(), tmpWorldQuat = new Quaternion(), tmpAimQuat = new Quaternion(), tmpDir = new Vector3();
  // 身体帧的实际间隔随机器性能浮动（慢机器上单帧推理可达数百毫秒）。
  // “肢体丢失后复位”的超时必须跟随实际节拍：固定 500ms 会在慢机器上
  // 于两次更新之间反复触发“复位→跟随”，表现为手臂（尤其静止的那只）乱抖。
  let lastApplyAt = 0, emaIntervalMs = 500;
  const reset = () => {
    for (const [name, rest] of rests) avatar()?.humanoid.getNormalizedBoneNode(name as VRMHumanBoneName)?.quaternion.copy(rest);
    rests.clear(); seen.clear();
  };
  function aim(name: string, childName: string, a: Landmark | undefined, b: Landmark | undefined, body: boolean, now: number) {
    const vrm = avatar();
    if (!vrm || !a || !b || [a, b].some(p => ![p.x,p.y,p.z].every(Number.isFinite) || (body && p.visibility < 0.5))) return;
    const bone = vrm.humanoid.getNormalizedBoneNode(name as VRMHumanBoneName);
    const child = vrm.humanoid.getNormalizedBoneNode(childName as VRMHumanBoneName);
    if (!bone?.parent || !child) return;
    const target = tmpTarget.set((b.x-a.x) * lateralSign(mirror()), a.y-b.y, a.z-b.z);
    if (target.lengthSq() < 1e-8) return;
    if (!rests.has(name)) rests.set(name, bone.quaternion.clone());
    seen.set(name, now);
    // Target is in scene world space. The normalized rig's parent transform already
    // includes rotateVRM0; applying a second version-specific flip is incorrect.
    target.normalize().applyQuaternion(bone.parent.getWorldQuaternion(tmpWorldQuat).invert());
    bone.quaternion.slerp(tmpAimQuat.setFromUnitVectors(tmpDir.copy(child.position).normalize(), target), 0.45);
    bone.updateWorldMatrix(false, true);
  }
  return { reset, apply(result: BodyResult, now: number) {
    if (lastApplyAt > 0) {
      const gap = now - lastApplyAt;
      if (gap > 0 && gap < 10000) emaIntervalMs = emaIntervalMs * 0.85 + gap * 0.15;
    }
    lastApplyAt = now;
    // 自适应复位超时：至少 1.5s，且为平均帧间隔的 3 倍。
    // 慢机器上帧间隔本身就接近/超过 500ms，固定阈值会把“还没等到下一次更新”
    // 误判为“肢体丢失”，导致骨骼在复位姿态和跟踪姿态之间来回跳。
    const staleMs = Math.max(1500, emaIntervalMs * 3);
    const p = result.pose;
    // Pose indices and hand labels are anatomical (the subject's own side); see src/mirror.mjs.
    const side = (subject: 'left' | 'right') => avatarSide(subject, mirror());
    for (const [source, shoulder, elbow, wrist, hip, knee, ankle, foot] of [['left',11,13,15,23,25,27,31],['right',12,14,16,24,26,28,32]] as const) {
      const s = side(source);
      for (const [bone,child,a,b] of [['UpperArm','LowerArm',shoulder,elbow],['LowerArm','Hand',elbow,wrist],['UpperLeg','LowerLeg',hip,knee],['LowerLeg','Foot',knee,ankle],['Foot','Toes',ankle,foot]] as const)
        aim(s+bone,s+child,p[a],p[b],true,now);
    }
    result.hands.forEach((points,i) => {
      const label = result.handedness[i]?.[0];
      if (!label || label.score < 0.5 || !['Left','Right'].includes(label.categoryName)) return;
      const s = side(label.categoryName === 'Left' ? 'left' : 'right');
      for (const [finger,start] of [['Index',5],['Middle',9],['Ring',13],['Little',17]] as const) {
        aim(s+finger+'Proximal',s+finger+'Intermediate',points[start],points[start+1],false,now);
        aim(s+finger+'Intermediate',s+finger+'Distal',points[start+1],points[start+2],false,now);
      }
      aim(s+'ThumbMetacarpal',s+'ThumbProximal',points[1],points[2],false,now);
      aim(s+'ThumbProximal',s+'ThumbDistal',points[2],points[3],false,now);
    });
    for (const [name, rest] of rests) if (now-(seen.get(name) ?? 0) > staleMs) {
      avatar()?.humanoid.getNormalizedBoneNode(name as VRMHumanBoneName)?.quaternion.copy(rest);
      rests.delete(name); seen.delete(name);
    }
  }};
}
