import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base 固定为 /admin/：与生产环境 go:embed 后的挂载路径一致，
// 开发模式访问 http://localhost:5173/admin/，API 经 proxy 转发到后端，天然同源。
export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  server: {
    port: 5173,
    proxy: {
      '/admin/api': 'http://127.0.0.1:3457',
      '/v1': 'http://127.0.0.1:3457',
      '/health': 'http://127.0.0.1:3457',
    },
  },
  build: {
    // 产物直接输出到 Go 包目录，供 internal/server 的 go:embed 嵌入
    outDir: '../internal/server/dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 2500,
  },
})
