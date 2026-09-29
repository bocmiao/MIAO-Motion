/**
 * Automatic render-scale controller. Body tracking competes with rendering for CPU, so while it runs a
 * short dip should not cost resolution: the controller keeps working but needs a lower frame rate over
 * a longer stretch before stepping down.
 */
export const AUTO_QUALITY_RULES = Object.freeze({
  normal: Object.freeze({ slowFps: 24, slowWindows: 2 }),
  bodyTracking: Object.freeze({ slowFps: 18, slowWindows: 4 }),
});
const WINDOW_MS = 5_000, FAST_FPS = 50, FAST_WINDOWS = 4, STEP = 0.25, MIN_RATIO = 0.5, MAX_RATIO = 1.5;

export function createAutoQuality() {
  let windowStart = 0, frames = 0, slowWindows = 0, fastWindows = 0, ratio = MAX_RATIO, bodyMode = false;
  return {
    get ratio() { return ratio; },
    /** Paused (hidden page or manual quality): forget the partial window. @param {number} now */
    reset(now) { windowStart = now; frames = slowWindows = fastWindows = 0; },
    /**
     * Count one rendered frame; at the end of each 5 s window returns the measured rate and chosen ratio.
     * @param {number} now @param {boolean} bodyTracking
     * @returns {{ fps: number; ratio: number; bodyTracking: boolean } | null}
     */
    frame(now, bodyTracking) {
      if (bodyTracking !== bodyMode) { bodyMode = bodyTracking; windowStart = now; frames = slowWindows = fastWindows = 0; }
      frames++;
      if (!windowStart) windowStart = now;
      if (now - windowStart < WINDOW_MS) return null;
      const rules = bodyTracking ? AUTO_QUALITY_RULES.bodyTracking : AUTO_QUALITY_RULES.normal;
      const fps = frames * 1000 / (now - windowStart);
      slowWindows = fps < rules.slowFps ? slowWindows + 1 : 0;
      fastWindows = fps > FAST_FPS ? fastWindows + 1 : 0;
      if (slowWindows >= rules.slowWindows) { ratio = Math.max(MIN_RATIO, ratio - STEP); slowWindows = 0; }
      if (fastWindows >= FAST_WINDOWS) { ratio = Math.min(MAX_RATIO, ratio + STEP); fastWindows = 0; }
      windowStart = now; frames = 0;
      return { fps, ratio, bodyTracking };
    },
  };
}
