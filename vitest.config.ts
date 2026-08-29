import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // node:sqlite 等 Node 内置模块不走 vite 转换
    server: {
      deps: {
        external: [/node:/],
      },
    },
    environment: 'node',
  },
});
