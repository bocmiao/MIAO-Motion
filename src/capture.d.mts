export function cameraConstraints(cameraId?: string): MediaStreamConstraints;
export function cameraErrorMessage(error: unknown, desktop?: boolean): string;
export function stopMediaStream(stream: Pick<MediaStream, 'getTracks'> | null | undefined): void;
export function createWithGpuFallback<T, O extends { baseOptions: Record<string, unknown> }>(create: (options: O & { baseOptions: O['baseOptions'] & { delegate: 'GPU' | 'CPU' } }) => Promise<T>, options: O, onFallback?: (error: unknown) => void): Promise<T>;
export function createInferenceHealthMonitor(options?: {
  onDegrade?: (reason: 'slow' | 'error', detail?: unknown) => void;
  slowThresholdMs?: number;
  sampleSize?: number;
  maxErrors?: number;
}): {
  readonly degraded: boolean;
  observe(durationMs: number): void;
  observeError(): void;
  reset(): void;
};
