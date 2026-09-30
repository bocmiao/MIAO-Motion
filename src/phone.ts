import { invoke, isTauri } from '@tauri-apps/api/core';
import { parsePhonePacket } from './phone-packet.mjs';
export { parsePhonePacket };

export const PHONE_NO_DATA_HINT = '还没有收到手机数据，请逐项检查：① 手机和电脑连的是同一个 Wi-Fi，路由器没有开启“AP 隔离”或“访客网络”；② Windows 把这个网络设成了“专用网络”（设成“公用网络”会被防火墙拦住）；③ 第一次弹出防火墙提示时点了“允许”；④ iFacialMocap 已打开并停在前台。';
const NO_DATA_AFTER_MS = 5_000;

/**
 * invoke 抛出的错误里可能混着英文系统原文（如 socket 错误码描述），直接展示会让用户困惑：
 * 映射成中文友好文案，原文由调用方记入诊断日志。
 */
export function friendlyPhoneError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/[\u4e00-\u9fa5]/.test(raw)) return raw; // Rust 侧已经是中文，直接展示
  if (/timed out|timeout/i.test(raw)) return '连接手机超时：请确认手机和电脑在同一 Wi-Fi，且 iFacialMocap 在前台';
  if (/refused|unreachable|10054|10061/i.test(raw)) return '无法连上手机：请确认 IP 填对、iFacialMocap 已打开并在前台';
  if (/permission|denied|10013/i.test(raw)) return '没有网络权限：请检查防火墙设置，或以管理员身份运行后重试';
  if (/already in use|10048/i.test(raw)) return '手机接收端口 49983 被占用：请关闭占用程序后重试';
  return '手机面捕连接失败：请按界面提示逐项检查网络后重试';
}

export function setupPhone(receive: (packet: NonNullable<ReturnType<typeof parsePhonePacket>>) => void, onError?: (kind: string, error: unknown) => void) {
  const button = document.getElementById('phone-toggle') as HTMLButtonElement;
  const status = document.getElementById('phone-status')!;
  let active = false, busy = false, next = 0, generation = 0, lastPacket = 0, startedAt = 0;
  if (!isTauri()) { button.disabled = true; status.textContent = '手机面捕需要 Windows 安装版'; }
  const stop = () => { active = false; generation++; void invoke('phone_stop').catch(() => {}); button.textContent = '连接手机面捕'; };
  button.addEventListener('click', async () => {
    if (active) { stop(); status.textContent = '手机面捕已停止'; return; }
    const request = ++generation; button.disabled = true;
    try {
      const peer = (document.getElementById('phone-ip') as HTMLInputElement).value.trim();
      const ip = await invoke<string>('phone_start', { peer });
      if (request !== generation) { void invoke('phone_stop'); return; }
      active = true; lastPacket = 0; startedAt = performance.now(); button.textContent = '停止手机面捕';
      status.textContent = `等待手机：在 iFacialMocap 将目标设为 ${ip}:49983（UDP），两台设备连接同一局域网。`;
    } catch (error) {
      onError?.('phone-start-error', error);
      status.textContent = friendlyPhoneError(error);
    }
    finally { button.disabled = false; }
  });
  window.addEventListener('pagehide', stop);
  return { tick(now: number) {
    if (!active || busy || now < next) return;
    busy = true; next = now + 33; const request = generation;
    void invoke<string | null>('phone_poll').then(text => {
      if (!active || request !== generation) return;
      if (lastPacket && now - lastPacket > 1000) status.textContent = '手机信号已中断，正在等待重新连接';
      else if (!lastPacket && now - startedAt > NO_DATA_AFTER_MS) status.textContent = PHONE_NO_DATA_HINT;
      if (!text) return;
      const packet = parsePhonePacket(text);
      if (packet) { lastPacket = now; receive(packet); status.textContent = '正在接收手机面捕 · 仅传动作参数'; }
    }).catch(() => { stop(); status.textContent = '手机接收器已停止，请重新连接'; }).finally(() => { busy = false; });
  } };
}
