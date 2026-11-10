import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 빌드 결과는 dist/index.html 하나로 묶인다(스크립트·스타일 인라인).
export default defineConfig({
  plugins: [viteSingleFile()],
  server: { port: 5183, strictPort: true, host: '127.0.0.1' },
  preview: { port: 5184, strictPort: true, host: '127.0.0.1' },
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 4000,
  },
});
