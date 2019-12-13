module.exports = {
  parser: "@typescript-eslint/parser",
  plugins: ["react-hooks"],
  extends: [
    "plugin:react/recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier/@typescript-eslint", // Disables rules from @typescript-eslint that would conflict with Prettier
    "plugin:prettier/recommended" // Make sure this always the last config to be loaded.
  ],
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: "module",
    ecmaFeatures: {
      jsx: true
    }
  },
  rules: {
    camelcase: "off",
    "@typescript-eslint/camelcase": "off",
    "@typescript-eslint/no-inferrable-types": "off",
    "@typescript-eslint/no-explicit-any": "off",

    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",

    "arrow-body-style": ["error", "always"],
    "no-console": ["error", { allow: ["warn", "error"] }],

    "react/prop-types": "off",
    "react/display-name": "off"
  },
  settings: {
    react: {
      version: "detect"
    }
  }
};
