export type Side = 'left' | 'right';
export const SOURCE_LEFT_IS_SUBJECT_LEFT: boolean;
export function oppositeSide(side: Side): Side;
export function avatarSide(subjectSide: Side, mirror: boolean): Side;
export function mapSide(sourceSide: Side, mirror: boolean): Side;
export function lateralSign(mirror: boolean): 1 | -1;
export function mirrorFace<T extends { blinkLeft: number; blinkRight: number; lookLeft: number; lookRight: number }>(motion: T, mirror: boolean): T;
