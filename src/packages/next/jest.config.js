/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  moduleDirectories: ["dist", "node_modules"],
  preset: "ts-jest",
  testEnvironment: "jsdom",
  testEnvironmentOptions: {
    // needed or jest imports the ts directly rather than the compiled
    // dist exported from our package.json. Without this imports won't work.
    // See https://jestjs.io/docs/configuration#testenvironment-string
    customExportConditions: ["node", "node-addons"],
  },
  testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
  globals: {
    "ts-jest": {
      tsconfig: "tsconfig-dist.json",
    },
  },
  setupFilesAfterEnv: ["./test/setup.js"],
};
