export const MAX_FPS: number;
export const CAPTURE_SHARE: number;
export function createFramePacer(): {
  readonly interval: number;
  readonly fps: number;
  readonly deliveredFps: number | null;
  record(cost: number, elapsed?: number, completedAt?: number): void;
  reset(): void;
};
