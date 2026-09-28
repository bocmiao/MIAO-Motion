import { latestRelease } from './release-info.js';
const status = document.querySelector('#release-status');
const list = document.querySelector('#release-files');
try {
  const release = await latestRelease();
  status.textContent = `可下载版本：${release.tag}`;
  for (const file of release.files) {
    const row = document.createElement('li');
    const link = document.createElement('a');
    link.href = file.browser_download_url;
    link.textContent = `${file.name.endsWith('.exe') ? '下载安装版' : '下载便携版'}（${(file.size / 1024 / 1024).toFixed(1)} MB）`;
    const hash = document.createElement('a');
    hash.href = file.checksum.browser_download_url;
    hash.textContent = '对应版本 SHA-256 校验文件';
    row.append(link, ' · ', hash);
    list.append(row);
  }
} catch {
  status.textContent = '无法联网获取最新附件（可能离线或 GitHub 限流）。请使用上方官方下载列表，下载同一版本的程序和校验文件。';
}
