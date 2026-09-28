import type { WebGLRenderer, Scene, Camera } from 'three';

// Shader compilation and GPU submission are different from a visible first frame.
export async function prepareAvatarFrame(renderer: WebGLRenderer, scene: Scene, camera: Camera, current: () => boolean) {
  await renderer.compileAsync(scene, camera);
  if (!current()) return;
  renderer.render(scene, camera);
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  if (!fence) throw new Error('无法准备角色画面，请重新启动 3D');
  gl.flush();
  const deadline = performance.now() + 60_000;
  try {
    await new Promise<void>((resolve, reject) => {
      const check = () => {
        if (!current()) { resolve(); return; }
        const result = gl.clientWaitSync(fence, 0, 0);
        if (result === gl.WAIT_FAILED || gl.isContextLost() || performance.now() > deadline) {
          reject(new Error('角色画面准备失败，请选择性能优先或重新启动 3D'));
        } else if (result === gl.TIMEOUT_EXPIRED) requestAnimationFrame(check);
        else requestAnimationFrame(() => resolve());
      };
      requestAnimationFrame(check);
    });
  } finally { gl.deleteSync(fence); }
}
