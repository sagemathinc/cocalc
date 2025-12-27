/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  testEnvironmentOptions: {
    // needed or jest imports the ts directly rather than the compiled
    // dist exported from our package.json. Without this imports won't work.
    // See https://jestjs.io/docs/configuration#testenvironment-string
    customExportConditions: ["node", "node-addons"],
  },
  moduleNameMapper: {
    "^p-limit$": "<rootDir>/test/mocks/p-limit.js",
    "^dropzone$": "<rootDir>/test/mocks/dropzone.js",
    "^@cocalc/frontend/users$": "<rootDir>/test/mocks/frontend-users.js",
    "^\\.\\./users$": "<rootDir>/test/mocks/frontend-users.js",
    "^\\.\\./\\.\\./users$": "<rootDir>/test/mocks/frontend-users.js",
    "^@cocalc/frontend/frame-editors/generic/chat$":
      "<rootDir>/test/mocks/generic-chat.js",
    "^\\.\\./generic/chat$": "<rootDir>/test/mocks/generic-chat.js",
    "^@xterm/xterm$": "<rootDir>/test/mocks/xterm.js",
    "^@xterm/addon-fit$": "<rootDir>/test/mocks/xterm-addon.js",
    "^@xterm/addon-web-links$": "<rootDir>/test/mocks/xterm-addon.js",
    "^@xterm/addon-webgl$": "<rootDir>/test/mocks/xterm-addon.js",
    "^\\.\\./time-travel-editor/actions$":
      "<rootDir>/test/mocks/time-travel-actions.js",
    "^pdfjs-dist$": "<rootDir>/test/mocks/pdfjs.js",
    "^pdfjs-dist/webpack\\.mjs$": "<rootDir>/test/mocks/pdfjs-webpack.js",
    "\\.(css|less|sass|scss)$": "<rootDir>/test/mocks/style.js",
    "\\.txt$": "<rootDir>/test/mocks/text.js",
  },
  testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
  setupFilesAfterEnv: ["./test/setup.js"],
};
