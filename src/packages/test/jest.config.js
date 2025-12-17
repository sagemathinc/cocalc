/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  testEnvironmentOptions: {
    // needed or jest imports the ts directly rather than the compiled
    // dist exported from our package.json. Without this imports won't work.
    // See https://jestjs.io/docs/configuration#testenvironment-string
    customExportConditions: ["node", "node-addons"],
  },
  testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
  setupFilesAfterEnv: ["./test/setup.js"],
  moduleNameMapper: {
    "^@cocalc/backend/(.*)$": "<rootDir>/../backend/$1",
    "^@cocalc/frontend/(.*)$": "<rootDir>/../frontend/$1",
    "^p-limit$": "<rootDir>/mocks/p-limit.js",
  },
};
