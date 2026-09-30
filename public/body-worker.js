/* Classic worker: the pinned MediaPipe WASM loader uses importScripts. */
importScripts('./mediapipe/vision_bundle.js');
let pose, hands, lastHands = null, frameSeq = 0;
// Any escaped async failure is reported so the page can restart this worker instead of waiting forever.
self.addEventListener('unhandledrejection', event => { self.postMessage({ type: 'error', message: String(event.reason) }); });
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
      if (!pose || !hands) throw new Error('body engines are not ready');
      const p = pose.detectForVideo(data.frame, data.now);
      // 手部推理隔帧跑一次：手指对手部帧率不敏感，省下一半的手部推理耗时，
      // 身体帧间隔缩短后手臂跟随更平滑。奇数帧复用上一次的手部结果。
      let h;
      if (frameSeq++ % 2 === 0 || !lastHands) {
        h = hands.detectForVideo(data.frame, data.now);
        lastHands = h;
      } else {
        h = lastHands;
      }
      self.postMessage({ type: 'result', pose: p.worldLandmarks[0] ?? [], hands: h.worldLandmarks, handedness: h.handedness, elapsed: performance.now() - started });
    } catch (error) { self.postMessage({ type: 'error', message: String(error) }); }
    finally { data.frame.close(); }
  }
};
