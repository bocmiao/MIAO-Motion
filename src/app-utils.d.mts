export type Background = 'studio' | 'green' | 'transparent';
export type AppSettings = { background: Background; cameraId: string; sensitivity: number };
export const DEFAULT_SETTINGS: Readonly<AppSettings>;
export function parseSettings(raw: string | null): AppSettings;
export function validateModelFile(file: Pick<File, 'name' | 'size'>, maxBytes: number): string;
export function cameraConstraints(cameraId?: string): MediaStreamConstraints;
export function cameraErrorMessage(error: unknown): string;
export function trackingQuality(fps: number, faceVisible: boolean): { label: string; level: 'idle' | 'good' | 'fair' | 'weak'; value: number };
export function scaleMotion<T extends Record<string, number>>(motion: T, sensitivity: number): T;
