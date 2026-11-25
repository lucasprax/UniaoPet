import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

function expressPlugin() {
  return {
    name: 'express-plugin',
    async configureServer(server: any) {
      const { default: api } = await import('./src/server/api.js');
      server.middlewares.use('/api', api);
      server.middlewares.use('/uniaopet/api', api);
    }
  };
}

export default defineConfig(() => {
  const isVercel = Boolean(process.env.VERCEL);
  const base = process.env.VITE_BASE_PATH || (isVercel ? '/' : '/uniaopet/');

  return {
    base,
    plugins: [react(), tailwindcss(), expressPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/uniao_pet_db.json', '**/uniao_pet_db*.json', '**/*.json']
      },
    },
  };
});
