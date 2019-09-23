const { defaults: tsjPreset } = require("ts-jest/presets");
const path = require("path");

module.exports = {
  projects: [
    {
      displayName: "smc-webapp",
      testMatch: ["<rootDir>/smc-webapp/**/*.ts"]
    }
  ],
  transform: {
    ...tsjPreset.transform
  },
  testRegex: "(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$",
  testPathIgnorePatterns: ["/node_modules/", "/test-mocha/"],
  modulePaths: [
    "<rootDir>/..",
    path.resolve(__dirname, "smc-util"),
    path.resolve(__dirname, "smc-util/misc"),
    path.resolve(__dirname, "smc-webapp"),
    path.resolve(__dirname, "smc-webapp/node_modules")
  ],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],

  // Setup Enzyme
  snapshotSerializers: ["enzyme-to-json/serializer"],
  setupFilesAfterEnv: ["<rootDir>/setupEnzyme.ts"]
};
