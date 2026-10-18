import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chatApi } from './server/chatApi';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      vue({
        template: {
          compilerOptions: {
            // <stickyflow-diagram> is a real custom element (registered by
            // defineStickyflowDiagram() in main.ts), not an unresolved Vue
            // component. Without this Vue's compiler warns "failed to
            // resolve component" for it.
            isCustomElement: tag => tag === 'stickyflow-diagram',
          },
        },
      }),
      chatApi(env),
    ],
  };
});
