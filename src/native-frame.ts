import { Color, SRGBColorSpace, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from 'three';

/** Read only the camera's 640×360 target, never the full-resolution preview canvas. */
export function createNativeFrame(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
  const width = 640, height = 360;
  const target = new WebGLRenderTarget(width, height);
  target.texture.colorSpace = SRGBColorSpace;
  const rgba = new Uint8Array(width * height * 4), bgr = new Uint8Array(width * height * 3);
  const originalColor = new Color();
  return {
    async capture(green: boolean) {
      const previous = renderer.getRenderTarget(), alpha = renderer.getClearAlpha();
      renderer.getClearColor(originalColor);
      const canvas = renderer.domElement;
      const scale = Math.min(width / canvas.width, height / canvas.height);
      const w = Math.round(canvas.width * scale), h = Math.round(canvas.height * scale);
      target.viewport.set(Math.floor((width - w) / 2), Math.floor((height - h) / 2), w, h);
      let pending: ReturnType<WebGLRenderer['readRenderTargetPixelsAsync']>;
      try {
        renderer.setRenderTarget(target);
        renderer.setClearColor(green ? 0x00ff00 : 0xe8e8f0, 1);
        renderer.clear();
        renderer.render(scene, camera);
        // WebGL2 pixel buffer + fence: waiting for the GPU yields to UI events.
        pending = renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height, rgba);
      } finally {
        renderer.setRenderTarget(previous);
        renderer.setClearColor(originalColor, alpha);
      }
      await pending;
      // WebGL rows start at the bottom; Softcam expects top-down BGR.
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const source = ((height - 1 - y) * width + x) * 4, dest = (y * width + x) * 3;
        bgr[dest] = rgba[source + 2]!; bgr[dest + 1] = rgba[source + 1]!; bgr[dest + 2] = rgba[source]!;
      }
      return bgr;
    },
  };
}
