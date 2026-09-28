import { Quaternion, Vector3 } from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import type { PoseLandmarker, HandLandmarker, Landmark } from '@mediapipe/tasks-vision';

export function setupBodyTracking(avatar: () => VRM | null, mirror: () => boolean) {
  const toggle = document.getElementById('body-tracking') as HTMLInputElement;
  const status = document.getElementById('body-status')!;
  let pose: PoseLandmarker | null = null, hands: HandLandmarker | null = null;
  let starting = false, generation = 0, last = 0, lastResult = 0;
  const rests = new Map<string, Quaternion>();
  const resetPose = () => {
    const vrm = avatar();
    for (const [name, rest] of rests) vrm?.humanoid.getNormalizedBoneNode(name as VRMHumanBoneName)?.quaternion.copy(rest);
    rests.clear();
  };
  const stop = () => {
    generation++; starting = false; pose?.close(); hands?.close(); pose = hands = null;
    resetPose(); status.textContent = '身体和手部追踪未开启';
  };
  const start = async () => {
    if (pose || starting) return;
    const request = ++generation; starting = true; status.textContent = '正在准备身体和手部追踪…';
    let p: PoseLandmarker | null = null, h: HandLandmarker | null = null;
    try {
      const { PoseLandmarker, HandLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const files = await FilesetResolver.forVisionTasks(new URL('./mediapipe/', document.baseURI).href);
      p = await PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: new URL('./mediapipe/pose_landmarker_lite.task', document.baseURI).href, delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 1 });
      if (request !== generation) { p.close(); return; }
      h = await HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: new URL('./mediapipe/hand_landmarker.task', document.baseURI).href, delegate: 'CPU' }, runningMode: 'VIDEO', numHands: 2 });
      if (request !== generation) { p.close(); h.close(); return; }
      pose = p; hands = h; status.textContent = '追踪已开启，请让身体和双手进入镜头';
    } catch {
      p?.close(); h?.close();
      if (request === generation) { toggle.checked = false; status.textContent = '追踪资源无法启动，请重新解压完整程序后重试'; }
    } finally { if (request === generation) starting = false; }
  };
  toggle.addEventListener('change', () => { if (!toggle.checked) stop(); });
  window.addEventListener('pagehide', stop);

  const aim = (name: string, childName: string, a: Landmark | undefined, b: Landmark | undefined) => {
    const vrm = avatar();
    if (!vrm || !a || !b || [a, b].some(p => !Number.isFinite(p.x + p.y + p.z) || (p.visibility ?? 1) < 0.5)) return;
    const bone = vrm.humanoid.getNormalizedBoneNode(name as VRMHumanBoneName);
    const child = vrm.humanoid.getNormalizedBoneNode(childName as VRMHumanBoneName);
    if (!bone || !child || !bone.parent) return;
    if (!rests.has(name)) rests.set(name, bone.quaternion.clone());
    // Normalized humanoid axes differ between VRM 0 and VRM 1.
    const xSign = mirror() ? 1 : -1;
    const target = new Vector3((b.x - a.x) * xSign, a.y - b.y, a.z - b.z);
    if (target.lengthSq() < 1e-8) return;
    if (vrm.meta.metaVersion === '0') { target.x *= -1; target.z *= -1; }
    target.normalize().applyQuaternion(bone.parent.getWorldQuaternion(new Quaternion()).invert());
    const localDirection = child.position.clone().normalize();
    bone.quaternion.slerp(new Quaternion().setFromUnitVectors(localDirection, target), 0.45);
    bone.updateWorldMatrix(false, true);
  };
  return {
    stop,
    resetPose,
    tick(video: HTMLVideoElement, now: number, active: boolean) {
      if (!toggle.checked || !active) { if (pose || starting) stop(); return; }
      if (!pose) { void start(); return; }
      if (now - last < 100 || video.readyState < 2) return;
      last = now;
      try {
        const points = pose.detectForVideo(video, now).worldLandmarks[0];
        if (points) {
          const left = mirror() ? 'left' : 'right', right = mirror() ? 'right' : 'left';
          for (const [side, shoulder, elbow, wrist, hip, knee, ankle, foot] of [[left, 11, 13, 15, 23, 25, 27, 31], [right, 12, 14, 16, 24, 26, 28, 32]] as const) {
            aim(`${side}UpperArm`, `${side}LowerArm`, points[shoulder], points[elbow]);
            aim(`${side}LowerArm`, `${side}Hand`, points[elbow], points[wrist]);
            aim(`${side}UpperLeg`, `${side}LowerLeg`, points[hip], points[knee]);
            aim(`${side}LowerLeg`, `${side}Foot`, points[knee], points[ankle]);
            aim(`${side}Foot`, `${side}Toes`, points[ankle], points[foot]);
          }
          lastResult = now;
        } else if (now - lastResult > 500) resetPose();
        const result = hands?.detectForVideo(video, now);
        result?.worldLandmarks.forEach((points, i) => {
          const label = result.handedness[i]?.[0]?.categoryName;
          const side = (label === 'Left') === mirror() ? 'left' : 'right';
          for (const [finger, start] of [['Index', 5], ['Middle', 9], ['Ring', 13], ['Little', 17]] as const) {
            aim(`${side}${finger}Proximal`, `${side}${finger}Intermediate`, points[start], points[start + 1]);
            aim(`${side}${finger}Intermediate`, `${side}${finger}Distal`, points[start + 1], points[start + 2]);
          }
          aim(`${side}ThumbMetacarpal`, `${side}ThumbProximal`, points[1], points[2]);
          aim(`${side}ThumbProximal`, `${side}ThumbDistal`, points[2], points[3]);
        });
        status.textContent = `身体${points ? '已识别' : '未入镜'} · 手部 ${result?.landmarks.length ?? 0}/2 · 低频追踪`;
      } catch { stop(); toggle.checked = false; status.textContent = '身体追踪失败，已停止；可重新勾选重试'; }
    },
  };
}
