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
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) return 'vendor-react';
            if (id.includes('@clerk')) return 'vendor-clerk';
            if (id.includes('react-syntax-highlighter')) return 'vendor-syntax';
            if (id.includes('react-markdown') || id.includes('remark-') || id.includes('rehype-')) return 'vendor-markdown';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('framer-motion')) return 'vendor-animation';
            if (id.includes('radix-ui')) return 'vendor-ui';
            if (id.includes('@lobehub/icons')) return 'vendor-lobehub-icons';
            if (id.includes('@lobehub')) return 'vendor-lobehub';
            if (id.includes('antd') || id.includes('@ant-design')) return 'vendor-antd';
            if (id.includes('zod') || id.includes('axios') || id.includes('zustand')) return 'vendor-utils';
            return 'vendor';
          }
        },
      },
    },
  },
})
