/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFiles: ["./test/setup.js"], // Path to your setup file
  testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
  transformIgnorePatterns: [
    "/node_modules/(?!micro-key-producer|@noble/curves|@noble/hashes)",
  ],
  // Ignore compiled output so Jest does not see duplicate mocks in dist/.
  modulePathIgnorePatterns: ["<rootDir>/dist/"],
  moduleNameMapper: {
    "^micro-key-producer/(.*)$": "<rootDir>/test/__mocks__/micro-key-producer/$1",
    "^package-directory$": "<rootDir>/test/__mocks__/package-directory.js",
    "^@cocalc/backend/(.*)$": "<rootDir>/../backend/$1",
  },
};
