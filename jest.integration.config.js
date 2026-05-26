/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.integration.test.ts'],
  setupFiles: ['<rootDir>/src/test/loadEnv.ts'],
  globalSetup: '<rootDir>/src/test/globalSetup.ts',
  moduleNameMapper: {
    '^ioredis$': '<rootDir>/src/test/redisMock.ts',
  },
};
