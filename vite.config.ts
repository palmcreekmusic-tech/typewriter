import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Relative base so the same build works on GitHub Pages and inside the Tauri shell.
export default defineConfig({
  base: './',
  plugins: [svelte()],
  test: { include: ['tests/**/*.test.ts'] },
});
