const nextJest = require("next/jest");

const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const customJestConfig = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    // Mock Leaflet CSS import — Jest/jsdom doesn't process CSS files.
    // next/jest already handles most CSS via its transform, but an explicit
    // mapping here ensures leaflet's CSS never causes a module-not-found error
    // in test runs even if leaflet isn't installed locally.
    "^leaflet/dist/leaflet\\.css$": "<rootDir>/src/__mocks__/fileMock.js",
    // Mock leaflet itself in tests — the OperationalMap uses dynamic import
    // inside useEffect (client-only), so it won't run in Jest's jsdom at all.
    // This mapping prevents "Cannot find module 'leaflet'" from crashing Jest
    // if a test accidentally tries to resolve it.
    "^leaflet$": "<rootDir>/src/__mocks__/leafletMock.js",
    "^react-leaflet$": "<rootDir>/src/__mocks__/reactLeafletMock.js",
  },
  testPathIgnorePatterns: ["<rootDir>/node_modules/", "<rootDir>/.next/", "<rootDir>/e2e/"],
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/*.d.ts"],
};

module.exports = createJestConfig(customJestConfig);
