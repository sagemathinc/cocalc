require("@testing-library/jest-dom");
process.env.COCALC_TEST_MODE = true;

global.TextEncoder = require("util").TextEncoder;
global.TextDecoder = require("util").TextDecoder;

// In the browser build, DEBUG is injected by rspack. Tests run under Jest need
// a stub to avoid ReferenceError when frontend code imports console.ts.
global.DEBUG = false;
