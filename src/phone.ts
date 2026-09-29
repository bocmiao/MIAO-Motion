import { invoke, isTauri } from '@tauri-apps/api/core';
import { parsePhonePacket } from './phone-packet.mjs';
export { parsePhonePacket };

export function setupPhone(receive: (packet: NonNullable<ReturnType<typeof parsePhonePacket>>) => void) {
  const button = document.getElementById('phone-toggle') as HTMLButtonElement;
  const status = document.getElementById('phone-status')!;
  let active = false, busy = false, next = 0, generation = 0, lastPacket = 0;
  if (!isTauri()) { button.disabled = true; status.textContent = '手机面捕需要 Windows 安装版'; }
  const stop = () => { active = false; generation++; void invoke('phone_stop').catch(() => {}); button.textContent = '连接手机面捕'; };
  button.addEventListener('click', async () => {
    if (active) { stop(); status.textContent = '手机面捕已停止'; return; }
    const request = ++generation; button.disabled = true;
    try {
      const peer = (document.getElementById('phone-ip') as HTMLInputElement).value.trim();
      const ip = await invoke<string>('phone_start', { peer });
      if (request !== generation) { void invoke('phone_stop'); return; }
      active = true; lastPacket = 0; button.textContent = '停止手机面捕';
      status.textContent = `等待手机：在 iFacialMocap 将目标设为 ${ip}:49983（UDP），两台设备连接同一局域网。`;
    } catch (error) { status.textContent = String(error); }
    finally { button.disabled = false; }
  });
  window.addEventListener('pagehide', stop);
  return { tick(now: number) {
    if (!active || busy || now < next) return;
    busy = true; next = now + 33; const request = generation;
    void invoke<string | null>('phone_poll').then(text => {
      if (!active || request !== generation) return;
      if (lastPacket && now - lastPacket > 1000) status.textContent = '手机信号已中断，正在等待重新连接';
      if (!text) return;
      const packet = parsePhonePacket(text);
      if (packet) { lastPacket = now; receive(packet); status.textContent = '正在接收手机面捕 · 仅传动作参数'; }
    }).catch(() => { stop(); status.textContent = '手机接收器已停止，请重新连接'; }).finally(() => { busy = false; });
  } };
}
