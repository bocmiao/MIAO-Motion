/**
 * Virtual camera output pacing. Each output frame reads the WebGL canvas back, repacks it to BGR and
 * sends it over IPC, all on the page's main thread. On a PC without a capable GPU that work alone can
 * saturate the thread and freeze the interface, so the gap between frames grows with the measured
 * capture cost: capture may use at most CAPTURE_SHARE of the main thread, trading output frame rate
 * for a responsive app.
 */
export const MAX_FPS = 15;
export const CAPTURE_SHARE = 0.2;
const MIN_INTERVAL = 1000 / MAX_FPS, MAX_INTERVAL = 1000, SMOOTHING = 0.2;

export function createFramePacer() {
  let averageCost = 0;
  return {
    /** Milliseconds to wait after a frame starts before the next one may. */
    get interval() {
      return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, averageCost / CAPTURE_SHARE));
    },
    /** Output frames per second at the current interval. */
    get fps() {
      return Math.max(1, Math.round(1000 / this.interval));
    },
    /** @param {number} cost synchronous milliseconds the last capture took */
    record(cost) {
      if (!Number.isFinite(cost) || cost < 0) return;
      averageCost = averageCost === 0 ? cost : averageCost * (1 - SMOOTHING) + cost * SMOOTHING;
    },
    reset() {
      averageCost = 0;
    },
  };
}
