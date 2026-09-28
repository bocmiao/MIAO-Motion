export const releasesUrl = 'https://github.com/bocmiao/MIAO-Motion/releases';
export const releasesApi = 'https://api.github.com/repos/bocmiao/MIAO-Motion/releases?per_page=30';

/** @param {string} tag */
export function versionParts(tag) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-beta)?$/.exec(tag);
  return match ? match.slice(1).map(Number) : null;
}

/** @param {string} candidate @param {string} current */
export function isNewer(candidate, current) {
  const a = versionParts(candidate), b = versionParts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
}

/** @param {unknown} data */
export function selectRelease(data) {
  if (!Array.isArray(data)) throw new Error('发布数据无效');
  const candidates = data.filter(r => !r.draft && versionParts(r.tag_name) && Array.isArray(r.assets));
  candidates.sort((a, b) => isNewer(a.tag_name, b.tag_name) ? -1 : isNewer(b.tag_name, a.tag_name) ? 1 : 0);
  for (const r of candidates) {
    const prefix = `${releasesUrl}/download/${r.tag_name}/`;
    /** @type {{name: string, browser_download_url: string, size: number}[]} */
    const assets = r.assets.filter(/** @param {{name: unknown, browser_download_url: unknown}} a */ a => typeof a.name === 'string' && typeof a.browser_download_url === 'string'
      && a.browser_download_url.startsWith(prefix) && a.browser_download_url === prefix + a.name);
    const installer = assets.find(a => /^MIAO[. -]Motion_[\d.]+_x64-setup\.exe$/.test(a.name));
    const portable = assets.find(a => a.name === 'MIAO-Motion-portable.zip');
    const files = [installer, portable].filter(a => a !== undefined).map(a => ({ ...a, checksum: assets.find(s => s.name === `${a.name}.sha256`) }));
    if (files.length === 2 && files.every(a => a.checksum)) return { tag: r.tag_name, files };
  }
  throw new Error('暂时没有附件齐全的测试版，请查看官方下载列表');
}

export async function latestRelease() {
  const response = await fetch(releasesApi, { signal: AbortSignal.timeout(10_000), cache: 'no-store', credentials: 'omit' });
  if (!response.ok) throw new Error('暂时无法读取发布信息，请查看官方下载列表');
  return selectRelease(await response.json());
}
