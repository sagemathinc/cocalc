import { run_formatter_string as formatString } from "./index";

describe("format some strings", () => {
  it("formats markdown with math", async () => {
    const s = await formatString({
      str: "#   foo\n\n-  $\\int x^2$\n- blah",
      options: { parser: "markdown" },
    });
    expect(s).toEqual("# foo\n\n- $\\int x^2$\n- blah\n");
  });

  it("formats some python", async () => {
    const s = await formatString({
      str: "def    f(   n  = 0):\n   print(  n   )",
      options: { parser: "python" },
    });
    expect(s).toEqual("def f(n=0):\n    print(n)\n");
  });

  it("format some typescript", async () => {
    const s = await formatString({
      str: "function    f(  n  = 0) { console.log(  n   ) }",
      options: { parser: "typescript" },
    });
    expect(s).toEqual("function f(n = 0) {\n  console.log(n);\n}\n");
  });

  it("formatting invalid typescript throws an error", async () => {
    await expect(async () => {
      await formatString({
        str: "function    f(  n  = 0) { console.log(  n   ) ",
        options: { parser: "typescript" },
      });
    }).rejects.toThrow("'}' expected");
  });
});
