import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Optional proxy: set the in-app base URL to /deepseek/v1 and Vite forwards it upstream.
// Not needed for api.deepseek.com itself (it allows browser CORS), but handy for pointing
// the app at a local mock server via DEEPSEEK_PROXY_TARGET, or for corporate networks.
function deepseekProxy(env) {
  const target = env.DEEPSEEK_PROXY_TARGET || 'https://api.deepseek.com';
  return {
    '/deepseek': {
      target,
      changeOrigin: true,
      secure: true,
      rewrite: (path) => path.replace(/^\/deepseek/, ''),
    },
  };
}

// `npm run build`            -> normal multi-file build in dist/ (relative paths: works on GitHub Pages)
// `npm run build:standalone` -> one self-contained HTML file in dist-standalone/ (real DeepSeek calls)
// `npm run build:single`     -> one HTML file for the claude.ai hosted preview (no outside calls)
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const sandboxed = mode === 'single';
  const singleFile = sandboxed || mode === 'standalone';
  return {
    base: './',
    plugins: [react(), ...(singleFile ? [viteSingleFile()] : [])],
    define: {
      // The sandboxed preview can't make network calls or downloads, so it runs on demo replies.
      __CHARCOAL_SANDBOXED__: JSON.stringify(sandboxed),
    },
    server: { proxy: deepseekProxy(env) },
    preview: { proxy: deepseekProxy(env) },
    build: { outDir: sandboxed ? 'dist-single' : mode === 'standalone' ? 'dist-standalone' : 'dist' },
  };
});
