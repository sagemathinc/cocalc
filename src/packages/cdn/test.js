describe("test that the built module description object exists and has some properties", () => {
  const obj = require(".");

  it("has a path that contains cdn", () => {
    expect(obj.path).toContain("/cdn/");
  });

  it("has versions for the five modules it should have", () => {
    for (const name of ["codemirror", "katex"]) {
      expect(obj.versions).toHaveProperty(name);
    }
  });
});
