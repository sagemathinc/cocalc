/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFiles: ["./test/setup.js"],
  testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
  maxConcurrency: 1,
  moduleNameMapper: {
    "^@cocalc/backend/(.*)$": "<rootDir>/../backend/$1",
  },
};
