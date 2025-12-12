require("@testing-library/jest-dom");
process.env.COCALC_TEST_MODE = true;

// polyfill TextEncoder so we can run tests using nodej.s
const { TextEncoder, TextDecoder } = require("util");
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// In production builds DEBUG is injected by the bundler. For tests, default to false.
global.DEBUG = false;
