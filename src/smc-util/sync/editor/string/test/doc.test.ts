import { StringDocument } from "../doc";

describe("create a String document and call methods on it", () => {
  let doc: StringDocument;

  it("creates the doc", () => {
    doc = new StringDocument("cocalc");
    expect(`${doc}`).toBe("[object Object]");
  });

  it("convert to string", () => {
    expect(doc.to_str()).toBe("cocalc");
  });

  it("checks equality", () => {
    expect(doc.is_equal()).toBe(false);
    expect(doc.is_equal(undefined)).toBe(false);
    expect(doc.is_equal(doc)).toBe(true);
    expect(doc.is_equal(new StringDocument("cocalc"))).toBe(true);
    expect(doc.is_equal(new StringDocument("sagemathcloud"))).toBe(false);
  });

  it("make and apply a patch", () => {
    const patch = doc.make_patch(new StringDocument("CoCalc"));
    expect(doc.apply_patch(patch).to_str()).toBe("CoCalc");
  });

  it("set the document (thus making a new one, since immutable!)", () => {
    const d2 = doc.set("CoCalc");
    expect(doc.to_str()).toBe("cocalc");
    expect(d2.to_str()).toBe("CoCalc");

    // also test type checking
    expect(() => {
      doc.set(0);
    }).toThrow("must be a string");
  });

  it("tests that the db-like API all throws errors", () => {
    expect(() => doc.get()).toThrow("don't have meaning");
    expect(() => doc.get_one()).toThrow("don't have meaning");
    expect(() => doc.delete()).toThrow("doesn't have meaning");
    expect(doc.changes(doc)).toBe(undefined);
  });

  it("count gives length", () => {
    expect(doc.count()).toBe(doc.to_str().length);
  });
});
