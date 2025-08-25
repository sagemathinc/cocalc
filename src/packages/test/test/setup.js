require("@testing-library/jest-dom");
process.env.COCALC_TEST_MODE = true;

global.TextEncoder = require("util").TextEncoder;
global.TextDecoder = require("util").TextDecoder;
