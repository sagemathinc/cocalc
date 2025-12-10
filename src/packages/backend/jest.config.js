/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFiles: ["./test/setup.js"],
  testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
   // Allow package-style imports (e.g., @cocalc/backend/conat/test/setup) to
   // resolve directly to the source tree during tests.
   moduleNameMapper: {
     "^@cocalc/backend/(.*)$": "<rootDir>/$1",
   },
};
