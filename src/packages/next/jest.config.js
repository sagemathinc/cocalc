const config = {
  moduleDirectories: ["dist", "node_modules"],
  modulePathIgnorePatterns: [
    "<rootDir>/dist/pages/email/test.js",
    "<rootDir>/dist/pages/api/v2/email/test.js",
  ]
};

module.exports = config;
