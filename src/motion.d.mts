export type MotionValues = Record<string, number>;
export type BlendshapeCategory = { categoryName: string; score: number };

export function solveExpressions(categories: BlendshapeCategory[]): MotionValues;
export function damping(deltaSeconds: number, speed?: number): number;
export function lerpMotion<T extends MotionValues>(current: T, target: T, alpha: number): T;

