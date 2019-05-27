module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "smc-util/misc2": "<rootDir>/../misc2"
  },
  testMatch: ["**/?(*.)+(spec|test).[tj]s?(x)"],
  testPathIgnorePatterns: ["/node_modules/"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"]
};
