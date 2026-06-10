import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['node_modules/', '.wrangler/', '**/*.test.ts'],
  },
  {
    files: ['contracts/**/*.ts', 'functions/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // 邊界收窄（D1 row / FormData / JSON）允許值層級 as cast；
      // object literal assertion 會吞掉漏欄位錯誤，禁止
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // server 端：禁止 console.log（敏感資料洩漏面），錯誤日誌走 error/warn
    files: ['functions/**/*.ts'],
    rules: {
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  }
)
