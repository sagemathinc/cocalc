import * as UglifyJS from "uglify-js";

// just a quick check, that this lib + how it is imported does work (it's a bit of a shot in the dark)
test("UglifyJS", () => {
  const result = UglifyJS.minify(
    `var foo = 1; var b = 2; function baz() { return foo + b; }; console.log(baz());`
  );
  expect(result.error).toBeUndefined();
  expect(result.code).toBe(
    "var foo=1,b=2;function baz(){return foo+b}console.log(baz());"
  );
});
