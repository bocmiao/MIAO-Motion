const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const average = (...values) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** Convert MediaPipe's named categories into the compact values used by VRM. */
export function solveExpressions(categories) {
  const scores = Object.fromEntries(categories.map(({ categoryName, score }) => [categoryName, score]));
  const score = (name) => scores[name] ?? 0;
  const shape = (value, floor = 0.04, ceiling = 0.75) => clamp((value - floor) / (ceiling - floor));

  const blinkLeft = shape(score('eyeBlinkLeft'));
  const blinkRight = shape(score('eyeBlinkRight'));
  const jawOpen = shape(score('jawOpen'), 0.03, 0.65);
  const mouthPucker = score('mouthPucker');
  const mouthFunnel = score('mouthFunnel');

  return {
    blinkLeft,
    blinkRight,
    aa: jawOpen * (1 - mouthPucker * 0.55),
    oh: clamp(jawOpen * 0.55 + mouthFunnel * 0.65),
    happy: shape(average(score('mouthSmileLeft'), score('mouthSmileRight')), 0.12, 0.8),
    lookUp: shape(average(score('eyeLookUpLeft'), score('eyeLookUpRight')), 0.08, 0.65),
    lookDown: shape(average(score('eyeLookDownLeft'), score('eyeLookDownRight')), 0.08, 0.65),
    lookLeft: shape(average(score('eyeLookOutLeft'), score('eyeLookInRight')), 0.08, 0.65),
    lookRight: shape(average(score('eyeLookInLeft'), score('eyeLookOutRight')), 0.08, 0.65),
  };
}

/** Frame-rate independent easing factor. */
export function damping(deltaSeconds, speed = 18) {
  return 1 - Math.exp(-speed * Math.max(0, deltaSeconds));
}

export function lerpMotion(current, target, alpha) {
  const next = {};
  for (const key of Object.keys(target)) {
    next[key] = current[key] + (target[key] - current[key]) * alpha;
  }
  return next;
}

