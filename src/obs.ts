type Reply = { requestStatus: { result: boolean; comment?: string }; responseData?: Record<string, unknown> };

// OBS WebSocket v5: only the local default endpoint; passwords never enter storage.
export async function configureObs(password: string) {
  const socket = new WebSocket('ws://127.0.0.1:4455');
  const pending = new Map<string, { resolve: (data: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  let sequence = 0;
  const sceneName = `喵动 ${crypto.randomUUID()}`, inputName = `${sceneName} 窗口`;
  let sceneCreated = false, inputCreated = false;
  let timer: ReturnType<typeof setTimeout>;
  const hash = async (text: string) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))));
  const send = (type: string, data: Record<string, unknown> = {}) => new Promise<Record<string, unknown>>((resolve, reject) => {
    const id = String(++sequence);
    if (socket.readyState !== WebSocket.OPEN) { reject(new Error('OBS 连接已关闭')); return; }
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('OBS 操作超时')); }, 5_000);
    pending.set(id, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
    socket.send(JSON.stringify({ op: 6, d: { requestType: type, requestId: id, requestData: data } }));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => { socket.close(); reject(new Error('OBS 连接超时，请启用工具 → WebSocket 服务器（端口 4455）')); }, 10_000);
      socket.onerror = () => reject(new Error('无法连接本机 OBS，请检查 WebSocket 服务器和密码'));
      socket.onclose = () => { reject(new Error('OBS 连接已关闭，请检查密码')); for (const p of pending.values()) p.reject(new Error('OBS 连接已关闭')); pending.clear(); };
      socket.onmessage = async event => {
        try {
          const message = JSON.parse(event.data);
          if (message.op === 0) {
            const auth = message.d.authentication;
            const authentication = auth ? await hash((await hash(password + auth.salt)) + auth.challenge) : undefined;
            socket.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, authentication, eventSubscriptions: 0 } }));
          } else if (message.op === 2) { clearTimeout(timer); resolve(); }
          else if (message.op === 7) {
            const reply = message.d as Reply & { requestId: string };
            const p = pending.get(reply.requestId); pending.delete(reply.requestId);
            if (reply.requestStatus.result) p?.resolve(reply.responseData ?? {});
            else p?.reject(new Error(reply.requestStatus.comment ?? 'OBS 操作失败'));
          }
        } catch { reject(new Error('OBS 返回了无法识别的数据')); }
      };
    });
    await send('CreateScene', { sceneName });
    sceneCreated = true;
    const input = await send('CreateInput', { sceneName, inputName, inputKind: 'window_capture', inputSettings: { cursor: false, client_area: true }, sceneItemEnabled: true });
    inputCreated = true;
    const properties = await send('GetInputPropertiesListPropertyItems', { inputName, propertyName: 'window' });
    const windows = Array.isArray(properties.propertyItems) ? properties.propertyItems : [];
    const window = windows.find(item => item.itemEnabled !== false && /MIAO Motion \/ 喵动/i.test(String(item.itemName)));
    if (!window) throw new Error('未找到喵动窗口，请先打开直播画面后重试。');
    await send('SetInputSettings', { inputName, inputSettings: { window: window.itemValue, cursor: false, client_area: true }, overlay: true });
    await send('CreateSourceFilter', { sourceName: inputName, filterName: '喵动绿幕', filterKind: 'chroma_key_filter_v2', filterSettings: { key_color_type: 'green', similarity: 400, smoothness: 80, spill: 100 } });
    if (typeof input.sceneItemId === 'number') {
      const video = await send('GetVideoSettings');
      await send('SetSceneItemTransform', { sceneName, sceneItemId: input.sceneItemId, sceneItemTransform: { boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: video.baseWidth, boundsHeight: video.baseHeight, positionX: 0, positionY: 0, alignment: 5 } });
    }
    return `已创建“${sceneName}”并设置窗口捕获与绿幕。请在 OBS 选择这个场景预览；确认后再开播。`;
  } catch (error) {
    let cleaned = true;
    if (inputCreated) { try { await send('RemoveInput', { inputName }); } catch { cleaned = false; } }
    if (sceneCreated) { try { await send('RemoveScene', { sceneName }); } catch { cleaned = false; } }
    throw new Error(String(error) + (cleaned ? '；本次新增内容已清理。' : `；连接中断，请在 OBS 手动删除本次新增的“${sceneName}”。`));
  } finally { clearTimeout(timer!); socket.close(); }
}
