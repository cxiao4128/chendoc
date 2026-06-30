import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    // 服务端单元测试环境
    environment: 'node',
    globals: true,
    // 服务端测试文件
    include: ['src/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.git/**',
      '**/coverage/**',
    ],
    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'coverage/server',
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.d.ts',
        '**/test/**',
        '**/tests/**',
        '**/__tests__/**',
        '**/types/**',
      ],
    },
    // 线程池配置（服务端测试需要更多并发）
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
        max: 4,
      },
    },
    // 环境变量
    env: {
      NODE_ENV: 'test',
      DATABASE_PROVIDER: 'sqlite',
      DATABASE_URL: 'file:./data/chendoc-test.sqlite',
      CHENDOC_ALLOW_SQLITE_RUNTIME: 'true',
    },
    // 测试超时
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@server': path.resolve(__dirname, 'src'),
    },
  },
})