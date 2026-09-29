import { Quaternion, Vector3 } from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import type { Landmark, Category } from '@mediapipe/tasks-vision';
import { avatarSide, lateralSign } from './mirror.mjs';
export type BodyResult = { pose: Landmark[]; hands: Landmark[][]; handedness: Category[][] };

export function createBodySolver(avatar: () => VRM | null, mirror: () => boolean) {
  const rests = new Map<string, Quaternion>(), seen = new Map<string, number>();
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
    const target = new Vector3((b.x-a.x) * lateralSign(mirror()), a.y-b.y, a.z-b.z);
    if (target.lengthSq() < 1e-8) return;
    if (!rests.has(name)) rests.set(name, bone.quaternion.clone());
    seen.set(name, now);
    // Target is in scene world space. The normalized rig's parent transform already
    // includes rotateVRM0; applying a second version-specific flip is incorrect.
    target.normalize().applyQuaternion(bone.parent.getWorldQuaternion(new Quaternion()).invert());
    bone.quaternion.slerp(new Quaternion().setFromUnitVectors(child.position.clone().normalize(), target), 0.45);
    bone.updateWorldMatrix(false, true);
  }
  return { reset, apply(result: BodyResult, now: number) {
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
    for (const [name, rest] of rests) if (now-(seen.get(name) ?? 0)>500) {
      avatar()?.humanoid.getNormalizedBoneNode(name as VRMHumanBoneName)?.quaternion.copy(rest);
      rests.delete(name); seen.delete(name);
    }
  }};
}
