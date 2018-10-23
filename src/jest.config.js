const { defaults: tsjPreset } = require("ts-jest/presets");
const path = require("path");

module.exports = {
  roots: ["<rootDir>/smc-webapp/"],
  transform: {
    ...tsjPreset.transform
  },
  testRegex: "(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$",
  testPathIgnorePatterns: ["/node_modules/", "/test-mocha/"],
  modulePaths: [
    path.resolve(__dirname, "smc-util"),
    path.resolve(__dirname, "smc-webapp"),
    path.resolve(__dirname, "smc-webapp/node_modules"),
  ],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],

  // Setup Enzyme
  "snapshotSerializers": ["enzyme-to-json/serializer"],
  "setupTestFrameworkScriptFile": "<rootDir>/setupEnzyme.ts",
};
