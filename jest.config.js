/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/e2e/**/*.e2e.test.ts'],
  testTimeout: 30000,
}
