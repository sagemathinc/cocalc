/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/hub/acp/__tests__"],
  testMatch: ["**/*.test.ts"],
  maxWorkers: 1,
  transform: {
    "^.+\\.ts$": ["ts-jest", { isolatedModules: true }],
  },
  transformIgnorePatterns: ["/node_modules/(?!(?:@agentclientprotocol)/)"],
};
