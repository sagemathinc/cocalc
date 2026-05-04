/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFiles: ["./test/setup.js"], // Path to your setup file
  testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
  // The Vercel AI SDK keeps HTTP connections alive after tests complete.
  // Force Jest to exit rather than hanging on open handles.
  forceExit: true,
};
