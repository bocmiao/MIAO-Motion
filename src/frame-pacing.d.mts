export const MAX_FPS: number;
export const CAPTURE_SHARE: number;
export function createFramePacer(): {
  readonly interval: number;
  readonly fps: number;
  record(cost: number): void;
  reset(): void;
};
