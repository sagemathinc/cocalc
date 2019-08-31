module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "smc-util/dmp": "<rootDir>/../dmp",
    "smc-util/misc": "<rootDir>/../misc"
  },
  testMatch: ["**/__tests__/**/*.[tj]s?(x)", "**/?(*.)+(spec|test).[tj]s?(x)"],
  testPathIgnorePatterns: ["/node_modules/"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"]
};
