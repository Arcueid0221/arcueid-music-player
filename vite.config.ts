import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    allowedHosts: ['terminal.local'],
  },
  build: {
    copyPublicDir: false,
    lib: {
      entry: 'src/index.ts',
      name: 'ArcueidMusicPlayer',
      formats: ['es', 'iife'],
      fileName: (format) =>
        format === 'es' ? 'arcueid-music-player.js' : 'arcueid-music-player.min.js',
    },
    sourcemap: true,
  },
  plugins: [dts({ insertTypesEntry: true, exclude: ['src/**/*.test.ts'] })],
})
