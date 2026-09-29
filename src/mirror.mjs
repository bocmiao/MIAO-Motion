/**
 * 喵动统一的左右 / 镜像约定。脸部表情与视线、头部、身体与手部、手机面捕四条路径都只通过这里换算侧别。
 *
 * - “本人侧”（subject side）：镜头前真人自己的左右。
 * - “角色侧”（avatar side）：VRM 角色自身的左右（VRM 规范：leftUpperArm / blinkLeft / lookLeft 都指角色自己的左侧；
 *   角色面向观众 +Z 时，角色自己的左侧位于画面右侧 +X）。
 * - 镜像开启 = 照镜子：本人左侧的动作出现在本人看来画面的左侧，也就是角色自身的右侧。
 * - 镜像关闭 = 同侧：本人左侧的动作由角色自身的左侧完成（观众看到的画面与摄像头原始画面一致）。
 */

/**
 * 真机确认点（唯一需要翻转的地方）：表情通道名里的 Left/Right 是否就是本人自己的左右。
 * 适用于 MediaPipe Face Landmarker 的 eyeBlinkLeft / eyeLookOutLeft 等，以及 iFacialMocap（ARKit）的 eyeBlink_L 等。
 *
 * 2026-09-29 实测（tasks-vision 1.0.1 + public/mediapipe/face_landmarker.task，Chromium）：
 * 一张真实的单眼闭合（wink）正脸照片中，闭着的眼睛位于画面左侧（网格点 33/159/145，上下眼睑间距 0.002），
 * 输出 eyeBlinkRight=0.65、eyeBlinkLeft=0.24；把同一张照片水平翻转后闭眼位于画面右侧，
 * 输出变为 eyeBlinkLeft=0.49、eyeBlinkRight=0.15。即 “Left” 始终对应画面右侧的眼睛；
 * 摄像头原始画面（未镜像）中画面右侧就是本人左眼，因此 Left = 本人左侧。
 * ARKit / iFacialMocap 的 eyeBlink_L 按苹果文档同为本人左眼，仍需 iPhone 真机确认。
 * 如真机发现单眼眨眼方向整体相反，只改这个常量即可。
 */
export const SOURCE_LEFT_IS_SUBJECT_LEFT = true;

/** @typedef {'left' | 'right'} Side */

/** @param {Side} side @returns {Side} */
export const oppositeSide = side => (side === 'left' ? 'right' : 'left');

/**
 * 本人侧 → 角色侧。身体姿态（MediaPipe Pose 11/13/15 为本人左臂）与手部（Hand Landmarker 的 handedness，
 * 官方 right_hands.jpg 实测输出 Right）都是解剖学左右，直接用这个函数。
 * @param {Side} subjectSide @param {boolean} mirror @returns {Side}
 */
export const avatarSide = (subjectSide, mirror) => (mirror ? oppositeSide(subjectSide) : subjectSide);

/**
 * 表情通道名中的侧别（Left/Right、_L/_R）→ 角色侧。
 * @param {Side} sourceSide @param {boolean} mirror @returns {Side}
 */
export const mapSide = (sourceSide, mirror) => avatarSide(SOURCE_LEFT_IS_SUBJECT_LEFT ? sourceSide : oppositeSide(sourceSide), mirror);

/**
 * 摄像头原始画面中的横向几何量（MediaPipe 世界坐标 x 朝画面右 = 本人左；头部偏航 / 侧倾同理）
 * 换算到角色空间（+X = 角色自身左侧）时的符号。与 avatarSide 共用同一约定。
 * @param {boolean} mirror @returns {1 | -1}
 */
export const lateralSign = mirror => (avatarSide('left', mirror) === 'left' ? 1 : -1);

/**
 * 把表情 / 视线从“通道名侧别”换算为“角色侧别”。输入与输出都用 blinkLeft / lookLeft 等字段，
 * 输出中的 Left 表示角色自身左侧（直接交给 VRM 的 blinkLeft / lookLeft / lookAt.yaw>0）。
 * @template {{ blinkLeft: number; blinkRight: number; lookLeft: number; lookRight: number }} T
 * @param {T} motion @param {boolean} mirror @returns {T}
 */
export function mirrorFace(motion, mirror) {
  if (mapSide('left', mirror) === 'left') return { ...motion };
  return { ...motion, blinkLeft: motion.blinkRight, blinkRight: motion.blinkLeft, lookLeft: motion.lookRight, lookRight: motion.lookLeft };
}
