import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
export default defineConfig(({ command }) => ({
  plugins: [{
    name: 'html-policy',
    transformIndexHtml(html) {
      // Vite HMR inserts style elements only in development. Production stays strict.
      const page = html.replaceAll('%MIAO_VERSION%', version);
      return command === 'serve' ? page.replace("style-src 'self';", "style-src 'self' 'unsafe-inline';") : page;
    },
  }],
}));
