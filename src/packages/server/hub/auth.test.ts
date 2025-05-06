// just a sanity check for dot-object

import dot from "dot-object";

describe("dot-object", () => {
  const o = {
    a: {
      b: "foo",
      "cd.1.2": "bar",
    },
  };

  it("default delimiter", () => {
    const v = dot.pick("a.b", o);
    expect(v).toEqual("foo");
  });

  it("custom delimiter", () => {
    const d = new dot("->");
    const v = d.pick("a->cd.1.2", o);
    expect(v).toEqual("bar");
  });
});
