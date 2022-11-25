import { test_err2str } from "./copy-path";

test("converting an error to a string", () => {
  const s = test_err2str(Error("sample error"));
  expect(s).toEqual("sample error");
});
