import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'write-version-json',
      buildStart() {
        writeFileSync('./public/version.json', JSON.stringify({ version }));
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
});
