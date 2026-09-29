import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
// Tauri CLI sets TAURI_ENV_PLATFORM (with TAURI_ENV_ARCH, TAURI_ENV_FAMILY, ...) for beforeDevCommand and
// beforeBuildCommand. Any other build is the browser/portable edition, which must not allow the desktop IPC origin.
const TAURI_ONLY_SOURCES = new Set(['ipc:', 'http://ipc.localhost']);

/** @param {string} html */
export function stripTauriSources(html) {
  return html.replace(/(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/, (_, start, policy, end) => start + policy
    .split(';').map(directive => directive.trim().split(/\s+/).filter((source, index) => index === 0 || !TAURI_ONLY_SOURCES.has(source)).join(' '))
    .filter(Boolean).join('; ') + end);
}

export default defineConfig(({ command }) => ({
  plugins: [{
    name: 'html-policy',
    transformIndexHtml(html) {
      // Vite HMR inserts style elements only in development. Production stays strict.
      let page = html.replaceAll('%MIAO_VERSION%', version);
      if (!process.env.TAURI_ENV_PLATFORM) page = stripTauriSources(page);
      return command === 'serve' ? page.replace("style-src 'self';", "style-src 'self' 'unsafe-inline';") : page;
    },
  }],
}));
