/* Classic worker: the pinned MediaPipe WASM loader uses importScripts. */
importScripts('./mediapipe/vision_bundle.js');
let pose, hands;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const files = await Vision.FilesetResolver.forVisionTasks(new URL('./mediapipe/', self.location.href).href);
      pose = await Vision.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: new URL('./mediapipe/pose_landmarker_lite.task', self.location.href).href, delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 1 });
      hands = await Vision.HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: new URL('./mediapipe/hand_landmarker.task', self.location.href).href, delegate: 'CPU' }, runningMode: 'VIDEO', numHands: 2 });
      self.postMessage({ type: 'ready' });
    } catch (error) { pose?.close(); hands?.close(); self.postMessage({ type: 'error', message: String(error) }); }
  } else if (data.type === 'frame') {
    const started = performance.now();
    try {
      const p = pose.detectForVideo(data.frame, data.now);
      const h = hands.detectForVideo(data.frame, data.now);
      self.postMessage({ type: 'result', pose: p.worldLandmarks[0] ?? [], hands: h.worldLandmarks, handedness: h.handedness, elapsed: performance.now() - started });
    } catch (error) { self.postMessage({ type: 'error', message: String(error) }); }
    finally { data.frame.close(); }
  }
};
