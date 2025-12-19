require("@testing-library/jest-dom");
process.env.COCALC_TEST_MODE = true;

// Polyfill TextEncoder/TextDecoder for gpt-tokenizer
const { TextEncoder, TextDecoder } = require("util");
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
