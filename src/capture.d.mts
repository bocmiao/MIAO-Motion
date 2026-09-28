export function cameraConstraints(cameraId?: string): MediaStreamConstraints;
export function cameraErrorMessage(error: unknown): string;
export function stopMediaStream(stream: Pick<MediaStream, 'getTracks'> | null | undefined): void;
export function createWithGpuFallback<T, O extends { baseOptions: Record<string, unknown> }>(create: (options: O & { baseOptions: O['baseOptions'] & { delegate: 'GPU' | 'CPU' } }) => Promise<T>, options: O, onFallback?: (error: unknown) => void): Promise<T>;
