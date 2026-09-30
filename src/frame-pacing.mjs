/** Output pacing includes capture work and asynchronous GPU/IPC latency. */
export const MAX_FPS = 15;
export const CAPTURE_SHARE = 0.2;
const MIN_INTERVAL = 1000 / MAX_FPS, SMOOTHING = 0.2;

export function createFramePacer() {
  let averageCost = 0, averageElapsed = 0, lastCompleted = null, averageInterval = 0;
  return {
    /** Milliseconds to wait after a frame starts before the next one may. */
    get interval() {
      return Math.max(MIN_INTERVAL, averageCost / CAPTURE_SHARE, averageElapsed * 1.2);
    },
    /** Output frames per second at the current interval. */
    get fps() {
      return Math.round(100000 / this.interval) / 100;
    },
    get deliveredFps() { return averageInterval > 0 ? 1000 / averageInterval : null; },
    /** @param {number} cost synchronous capture cost
     * @param {number} elapsed complete GPU + conversion + IPC latency
     * @param {number | undefined} completedAt actual successful delivery time */
    record(cost, elapsed = cost, completedAt) {
      if (!Number.isFinite(cost) || cost < 0) return;
      averageCost = averageCost === 0 ? cost : averageCost * (1 - SMOOTHING) + cost * SMOOTHING;
      if (Number.isFinite(elapsed) && elapsed >= 0) averageElapsed = averageElapsed === 0 ? elapsed : averageElapsed * (1 - SMOOTHING) + elapsed * SMOOTHING;
      if (Number.isFinite(completedAt)) {
        if (lastCompleted !== null && completedAt > lastCompleted) {
          const interval = completedAt - lastCompleted;
          averageInterval = averageInterval === 0 ? interval : averageInterval * (1 - SMOOTHING) + interval * SMOOTHING;
        }
        lastCompleted = completedAt;
      }
    },
    reset() {
      averageCost = averageElapsed = averageInterval = 0; lastCompleted = null;
    },
  };
}
