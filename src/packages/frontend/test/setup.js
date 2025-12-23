require("@testing-library/jest-dom");
process.env.COCALC_TEST_MODE = true;

// Polyfill TextEncoder and TextDecoder for Jest/jsdom environment
// These are needed by @msgpack/msgpack and other libraries
const { TextEncoder, TextDecoder } = require("util");
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Define DEBUG global (normally provided by rspack in production)
global.DEBUG = false;
