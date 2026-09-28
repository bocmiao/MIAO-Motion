import type * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { ModelMetrics } from './app-utils.mjs';

export type AvatarMotion = Record<string, number> & { blinkLeft: number; blinkRight: number; lookUp: number; lookDown: number; lookLeft: number; lookRight: number };
export function collectModelMetrics(root: THREE.Object3D, fileBytes: number): ModelMetrics;
export function mirrorMotion<T extends AvatarMotion>(motion: T, enabled: boolean): T;
export function gazeAngles(motion: AvatarMotion): { yaw: number; pitch: number };
export function relativeHeadRotation(current: THREE.Quaternion, neutral: THREE.Quaternion, sensitivity: number, mirrorEnabled: boolean): THREE.Quaternion;
export function idleBlink(elapsedMs: number): number;
export function vrmRotation(rotation: THREE.Quaternion, metaVersion: string): THREE.Quaternion;
export function applyNaturalPose(vrm: VRM): void;
export function frameAvatar(vrm: VRM, camera: THREE.PerspectiveCamera, target: THREE.Vector3, preset?: string): void;
