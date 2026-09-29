/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // react-native-worklets ships native-only entry points; its resolver picks the JS fallbacks under Jest.
  resolver: require.resolve('react-native-worklets/jest/resolver'),
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // Order matters: `@/assets/*` is `./assets/*` (tsconfig paths), not `src/assets/*`,
  // and SVG modules must resolve to the mock before the generic `@/` alias.
  moduleNameMapper: {
    '\\.svg$': '<rootDir>/test/svgMock.tsx',
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/api/schema.d.ts', '!src/app/**'],
};
