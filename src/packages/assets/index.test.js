const index = require(".");

test("index has a path ending in assets", () => {
  expect(index.path).toMatch(/assets$/);
});
