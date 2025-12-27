/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFiles: ["./test/setup.js"], // Path to your setup file
  testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
  collectCoverage: false, // Enable with --coverage flag or set to true
  collectCoverageFrom: [
    "postgres/**/*.ts",
    "!postgres/**/*.test.ts",
    "!postgres/**/*.spec.ts",
    "!postgres/**/*.d.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "html", "lcov"],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
