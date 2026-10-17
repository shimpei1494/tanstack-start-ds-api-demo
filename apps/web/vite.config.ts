import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nitro } from 'nitro/vite';

export default defineConfig({
  plugins: [
    tanstackStart({
      importProtection: {
        behavior: 'error',
        client: { specifiers: ['@demo/db', '@demo/ds-client'] },
      },
    }),
    nitro(),
    tailwindcss(),
    react(),
  ],
  server: { port: 3001 },
});
