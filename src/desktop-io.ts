import { invoke, isTauri } from '@tauri-apps/api/core';

let saving = false;

/** One save path for VRM, settings and diagnostics; cancellation is not success. */
export async function saveFile(name: string, blob: Blob): Promise<boolean> {
  if (isTauri()) {
    if (saving) throw new Error('请先完成已打开的保存窗口');
    saving = true;
    try {
      return await invoke<boolean>('save_export', new Uint8Array(await blob.arrayBuffer()), { headers: { 'x-file-name': encodeURIComponent(name) } });
    } finally { saving = false; }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

export function setupHelpLinks(notify: (message: string) => void) {
  const dialog = document.getElementById('help-dialog') as HTMLDialogElement;
  const frame = document.getElementById('help-frame') as HTMLIFrameElement;
  const title = document.getElementById('help-title')!;
  const localPages = new Set(['help.html', 'create-character.html', 'download.html', 'platforms.html', 'new-features.html', 'miao-license.html', 'example-license.html', 'licenses/THIRD_PARTY_LICENSES.txt', 'licenses/RUST_THIRD_PARTY_LICENSES.txt']);
  const root = new URL('./', document.baseURI);
  const handle = (event: Event) => {
    const anchor = (event.target as Element)?.closest('a');
    if (!anchor || anchor.hasAttribute('download')) return;
    const url = new URL(anchor.href);
    if (url.origin === root.origin) {
      const path = url.pathname.slice(root.pathname.length);
      if (!path || path === 'index.html') { event.preventDefault(); dialog.close(); return; }
      if (!localPages.has(path)) { event.preventDefault(); notify('无法打开这份说明'); return; }
      event.preventDefault();
      title.textContent = anchor.textContent || '使用说明';
      frame.src = url.href;
      if (!dialog.open) dialog.showModal();
    } else if (isTauri()) {
      event.preventDefault();
      void invoke('open_external', { url: url.href }).then(() => notify('已在系统浏览器打开')).catch(() => notify('无法打开网址：仅允许官方教程、许可和下载地址'));
    }
  };
  document.addEventListener('click', handle);
  document.addEventListener('auxclick', handle);
  frame.addEventListener('load', () => {
    frame.contentDocument?.addEventListener('click', handle);
    frame.contentDocument?.addEventListener('auxclick', handle);
  });
  document.getElementById('help-close')!.addEventListener('click', () => dialog.close());
}
