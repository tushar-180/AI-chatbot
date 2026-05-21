import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import tailwindcss from "@tailwindcss/vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: ['hoist-non-react-statics'],
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|scheduler)([\\/]|$)/,
              priority: 100,
            },
            {
              name: 'vendor-clerk',
              test: /node_modules[\\/]@clerk([\\/]|$)/,
              priority: 90,
            },
            {
              name: 'vendor-recharts',
              test: /node_modules[\\/](recharts|d3-|victory-)([\\/]|$)/,
              priority: 80,
            },
            {
              name: 'vendor-syntax',
              test: /node_modules[\\/](react-syntax-highlighter|refractor|prismjs|highlight\.js)([\\/]|$)/,
              priority: 75,
            },
            {
              name: 'vendor-markdown',
              test: /node_modules[\\/](react-markdown|remark-|rehype-|mdast-|micromark|unist-|vfile|property-information|space-separated-tokens|comma-separated-tokens|decode-named-character-reference|trim-lines)([\\/]|$)/,
              priority: 70,
            },
            {
              name: 'vendor-icons',
              test: /node_modules[\\/]lucide-react([\\/]|$)/,
              priority: 60,
            },
            {
              name: 'vendor-lobehub-icons',
              test: /node_modules[\\/]@lobehub[\\/]icons([\\/]|$)/,
              priority: 50,
            },
            {
              name: 'vendor-lobehub',
              test: /node_modules[\\/]@lobehub([\\/]|$)/,
              priority: 45,
            },
            {
              name: 'vendor-antd',
              test: /node_modules[\\/](antd|@ant-design)([\\/]|$)/,
              priority: 40,
            },
            {
              name: 'vendor-utils',
              test: /node_modules[\\/](zod|axios|zustand|socket.io-client)([\\/]|$)/,
              priority: 30,
            },
            {
              name: 'vendor',
              test: /node_modules/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
} as any)
