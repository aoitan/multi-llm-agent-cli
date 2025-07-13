/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
  transform: {
    '^.+\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  moduleNameMapper: {
    '^@ollama/(.*)$': '<rootDir>/src/ollama/$1',
    '^@cli/(.*)$': '<rootDir>/src/cli/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!node-fetch|data-uri-to-buffer)',
  ],
  testTimeout: 15000,
};