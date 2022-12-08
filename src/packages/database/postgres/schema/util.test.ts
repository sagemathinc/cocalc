import { quoteField } from "./util";

test("quoting a field", () => {
  expect(quoteField("Field")).toBe('"Field"');
});

test("quoting an already quoted field does nothing", () => {
  expect(quoteField('"Field"')).toBe('"Field"');
});

test("quoting a field with a space", () => {
  expect(quoteField("Field With Space")).toBe('"Field With Space"');
});
