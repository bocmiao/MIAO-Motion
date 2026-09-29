type Reply = { requestStatus: { result: boolean; code?: number; comment?: string }; responseData?: Record<string, unknown> };

/** OBS answered the request with a failure, so it certainly did not perform it. */
class ObsRejected extends Error {}

export const OBS_SCENE_BASE = '喵动 · 绿幕角色';
export const OBS_INPUT_BASE = '喵动 · 窗口捕获';

/** Readable name that is not used yet; OBS scenes and inputs share one name space. */
export function uniqueObsName(base: string, taken: Set<string>) {
  if (!taken.has(base)) return base;
  let index = 2;
  while (taken.has(`${base} ${index}`)) index++;
  return `${base} ${index}`;
}

// OBS WebSocket v5: only the local default endpoint; passwords never enter storage.
export async function configureObs(password: string) {
  const socket = new WebSocket('ws://127.0.0.1:4455');
  const pending = new Map<string, { resolve: (data: Record<string, unknown>) => void; reject: (error: Error) => void }>();
  let sequence = 0;
  // Registered *before* each create request: a request that times out may still complete in OBS later.
  const created: { kind: 'input' | 'scene'; name: string }[] = [];
  let sceneName = OBS_SCENE_BASE, inputName = OBS_INPUT_BASE;
  let timer: ReturnType<typeof setTimeout>;
  const hash = async (text: string) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))));
  const send = (type: string, data: Record<string, unknown> = {}) => new Promise<Record<string, unknown>>((resolve, reject) => {
    const id = String(++sequence);
    if (socket.readyState !== WebSocket.OPEN) { reject(new Error('OBS 连接已关闭')); return; }
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('OBS 操作超时')); }, 5_000);
    pending.set(id, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
    socket.send(JSON.stringify({ op: 6, d: { requestType: type, requestId: id, requestData: data } }));
  });
  const create = async (kind: 'input' | 'scene', name: string, type: string, data: Record<string, unknown>) => {
    const entry = { kind, name };
    created.push(entry);
    try { return await send(type, data); }
    catch (error) {
      // Only an explicit OBS refusal proves nothing was created (e.g. the name was taken meanwhile):
      // never try to remove a same-named scene or source that belongs to the user.
      if (error instanceof ObsRejected) created.splice(created.indexOf(entry), 1);
      throw error;
    }
  };
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
            else p?.reject(new ObsRejected(reply.requestStatus.comment ?? 'OBS 操作失败'));
          }
        } catch { reject(new Error('OBS 返回了无法识别的数据')); }
      };
    });
    const scenes = await send('GetSceneList');
    const inputs = await send('GetInputList');
    const taken = new Set<string>([
      ...(Array.isArray(scenes.scenes) ? scenes.scenes : []).map(scene => String(scene?.sceneName)),
      ...(Array.isArray(inputs.inputs) ? inputs.inputs : []).map(input => String(input?.inputName)),
    ]);
    sceneName = uniqueObsName(OBS_SCENE_BASE, taken);
    taken.add(sceneName);
    inputName = uniqueObsName(OBS_INPUT_BASE, taken);
    await create('scene', sceneName, 'CreateScene', { sceneName });
    const input = await create('input', inputName, 'CreateInput', { sceneName, inputName, inputKind: 'window_capture', inputSettings: { cursor: false, client_area: true }, sceneItemEnabled: true });
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
    return `已创建场景“${sceneName}”（窗口来源“${inputName}”）并设置窗口捕获与绿幕。请在 OBS 选择这个场景预览；确认后再开播。`;
  } catch (error) {
    const leftovers: string[] = [];
    // Inputs first (they live inside the scene), newest first.
    for (const { kind, name } of [...created].reverse()) {
      try { await send(kind === 'input' ? 'RemoveInput' : 'RemoveScene', kind === 'input' ? { inputName: name } : { sceneName: name }); }
      catch { leftovers.push(`${kind === 'input' ? '来源' : '场景'}“${name}”`); }
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(reason + (!leftovers.length
      ? (created.length ? '；本次新增内容已清理。' : '；OBS 中没有新增内容。')
      : `；未能自动清理，请在 OBS 中检查并手动删除本次新增的${leftovers.join('、')}（如果存在）。`));
  } finally { clearTimeout(timer!); socket.close(); }
}
