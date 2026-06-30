import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 基础测试环境配置
    environment: 'node',
    // 全局测试超时（毫秒）
    globals: true,
    // 测试文件匹配模式
    include: ['tests/unit/**/*.test.ts'],
    // 排除的文件
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.git/**',
      '**/coverage/**',
    ],
    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: 'coverage/unit',
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/coverage/**',
        '**/__tests__/**',
        '**/types/**',
      ],
    },
    // 报告器配置
    reporters: ['default', 'verbose'],
    // 工作线程配置（Vitest 4 推荐方式）
    workers: {
      max: 4,
    },
    // 环境变量
    env: {
      NODE_ENV: 'test',
      DATABASE_PROVIDER: 'sqlite',
      DATABASE_URL: 'file:./data/chendoc-test.sqlite',
    },
    // 测试顺序
    sequence: {
      shuffle: false,
    },
  },
})