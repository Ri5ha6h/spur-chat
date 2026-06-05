import type { PluginOption } from 'vite'
import { defineConfig } from 'vitest/config'
import { devtools } from '@tanstack/devtools-vite'
import { nitro } from 'nitro/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const isTest = process.env.VITEST === 'true'

const plugins: PluginOption[] = [
  !isTest && devtools(),
  tailwindcss(),
  !isTest &&
    tanstackStart({
      spa: {
        enabled: true,
        prerender: {
          outputPath: "/index.html",
        },
      },
    }),
  !isTest && nitro(),
  viteReact(),
].filter(Boolean) as PluginOption[]

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins,
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})

export default config
