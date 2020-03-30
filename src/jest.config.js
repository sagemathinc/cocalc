const { defaults: tsjPreset } = require("ts-jest/presets");
const path = require("path");

module.exports = {
  projects: [
    {
      displayName: "smc-webapp",
      testMatch: [
        "<rootDir>/smc-webapp/**/*test.ts",
        "<rootDir>/smc-webapp/**/*test.tsx",
      ],
      transform: {
        ...tsjPreset.transform,
      },
      testPathIgnorePatterns: ["/node_modules/", "/test-mocha/", "/data/"],
      moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
      modulePaths: [
        path.resolve(__dirname, "smc-util"),
        path.resolve(__dirname, "smc-util/misc"),
        path.resolve(__dirname, "smc-webapp"),
        path.resolve(__dirname, "smc-webapp/node_modules"),
      ],

      // Setup Enzyme
      snapshotSerializers: ["enzyme-to-json/serializer"],
      setupFilesAfterEnv: ["<rootDir>/setupEnzyme.ts"],
    },
    {
      displayName: "smc-util",
      testMatch: ["<rootDir>/smc-util/**/*test.ts"],
      transform: {
        ...tsjPreset.transform,
      },
      testPathIgnorePatterns: ["/node_modules/", "/test-mocha/", "/data/"],
      moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
      modulePaths: [
        path.resolve(__dirname, "smc-util"),
        path.resolve(__dirname, "smc-util/misc"),
        path.resolve(__dirname, "smc-webapp"),
        path.resolve(__dirname, "smc-webapp/node_modules"),
      ],
    },
  ],
};
