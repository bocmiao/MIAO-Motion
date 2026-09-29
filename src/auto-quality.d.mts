export const AUTO_QUALITY_RULES: Readonly<{ normal: Readonly<{ slowFps: number; slowWindows: number }>; bodyTracking: Readonly<{ slowFps: number; slowWindows: number }> }>;
export function createAutoQuality(): {
  readonly ratio: number;
  reset(now: number): void;
  frame(now: number, bodyTracking: boolean): { fps: number; ratio: number; bodyTracking: boolean } | null;
};
