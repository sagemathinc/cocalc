/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { ImmerDBDocument, from_str } from "../doc";

describe("ImmerDBDocument with one primary key", () => {
  let doc: ImmerDBDocument;
  const records = [
    { key: "cocalc", value: "sagemath" },
    { key: "cloud", value: "collaboration" },
  ];

  it("creates the db-doc", () => {
    doc = new ImmerDBDocument(new Set(["key"]), new Set([]), records);
    expect(`${doc}`).toBe("[object Object]");
  });

  it("convert to string", () => {
    expect(doc.to_str()).toBe(
      '{"key":"cloud","value":"collaboration"}\n{"key":"cocalc","value":"sagemath"}',
    );
  });

  it("count gives number of records", () => {
    expect(doc.count()).toBe(2);
  });

  it("checks equality", () => {
    expect(doc.is_equal()).toBe(false);
    expect(doc.is_equal(undefined)).toBe(false);
    expect(doc.is_equal(doc)).toBe(true);
    expect(
      doc.is_equal(new ImmerDBDocument(new Set(["key"]), new Set([]), records)),
    ).toBe(true);
    expect(doc.is_equal(new ImmerDBDocument(new Set(["key"]), new Set([])))).toBe(
      false,
    );
  });

  it("make and apply a patch", () => {
    const doc2 = doc
      .set([
        { key: "new", value: "value" },
        { key: "cloud", value: "computing" },
      ])
      .delete({ key: "cocalc" });
    const patch = doc.make_patch(doc2);
    expect(patch).toEqual([
      -1,
      [{ key: "cocalc" }],
      1,
      [
        { key: "new", value: "value" },
        { key: "cloud", value: "computing" },
      ],
    ]);
    expect(doc.apply_patch(patch).is_equal(doc2)).toBe(true);

    // Apply to doc2 instead -- obviously shouldn't work.
    expect(doc2.apply_patch(patch).is_equal(doc)).toBe(false);

    // Patch in reverse direction.
    const patch2 = doc2.make_patch(doc);
    expect(patch2).toEqual([
      -1,
      [{ key: "new" }],
      1,
      [
        { key: "cocalc", value: "sagemath" },
        { key: "cloud", value: "collaboration" },
      ],
    ]);
    expect(doc2.apply_patch(patch2).is_equal(doc)).toBe(true);
  });

  it("tests get_one", () => {
    let x = doc.get_one({ key: "cloud" });
    if (x == null) throw Error("bug");
    expect(x).toEqual({ key: "cloud", value: "collaboration" });

    // can only search on primary keys
    expect(() => doc.get_one({ value: "collaboration" })).toThrow(
      "must be a primary key",
    );

    x = doc.get_one({});
    if (x == null) throw Error("bug");
    expect(x).toEqual({ key: "cocalc", value: "sagemath" });
  });

  it("tests get", () => {
    expect(doc.get({})).toEqual([
      { key: "cocalc", value: "sagemath" },
      { key: "cloud", value: "collaboration" },
    ]);
    expect(doc.get({ key: "cloud" })).toEqual([
      { key: "cloud", value: "collaboration" },
    ]);

    // can only search on primary keys
    expect(() => doc.get({ value: "collaboration" })).toThrow(
      "must be a primary key",
    );
  });

  it("tests delete", () => {
    const doc2 = doc.delete({ key: "cloud" });
    expect(doc2.to_str()).toBe('{"key":"cocalc","value":"sagemath"}');
  });

  it("tests set changing a field", () => {
    const doc2 = doc.set({ key: "cloud", value: "computing" });
    expect(doc2.get({ key: "cloud" })).toEqual([
      { key: "cloud", value: "computing" },
    ]);
  });

  it("tests set adding a new field", () => {
    const doc2 = doc.set({ key: "cloud", other: [1, 2, 3] });
    expect(doc2.get({ key: "cloud" })).toEqual([
      { key: "cloud", other: [1, 2, 3], value: "collaboration" },
    ]);
  });
});

describe("ImmerDBDocument patch variants", () => {
  it("string patch -- atomic", () => {
    const doc = new ImmerDBDocument(new Set(["key"]), new Set([]), [
      { key: "cocalc", value: "a string" },
    ]);
    const patch = doc.make_patch(
      doc.set({ key: "cocalc", value: "a different string" }),
    );
    expect(patch).toEqual([
      1,
      [{ key: "cocalc", value: "a different string" }],
    ]);

    const patch2 = doc.make_patch(doc.set({ key: "cocalc", value: null }));
    expect(patch2).toEqual([1, [{ key: "cocalc", value: null }]]);
    expect(doc.apply_patch(patch2).to_str()).toBe('{"key":"cocalc"}');
  });

  it("string patch -- diff", () => {
    const doc = new ImmerDBDocument(
      new Set(["key"]),
      new Set(["value"]),
      [{ key: "cocalc", value: "a string" }],
    );
    const patch = doc.make_patch(
      doc.set({ key: "cocalc", value: "a different string" }),
    );
    expect(patch).toEqual([
      1,
      [
        {
          key: "cocalc",
          value: [
            [
              [
                [0, "a "],
                [1, "different "],
                [0, "string"],
              ],
              0,
              0,
              8,
              18,
            ],
          ],
        },
      ],
    ]);

    const patch2 = doc.make_patch(doc.set({ key: "cocalc", value: null }));
    expect(patch2).toEqual([1, [{ key: "cocalc", value: null }]]);
  });

  it("map patch -- diffed", () => {
    const doc = new ImmerDBDocument(new Set(["key"]), new Set([]), [
      { key: "cocalc", value: { one: 1, two: 2, five: 5 } },
    ]);

    const doc2 = doc.set({ key: "cocalc", value: { two: "two" } });
    expect(doc2.to_str()).toBe(
      '{"key":"cocalc","value":{"five":5,"one":1,"two":"two"}}',
    );

    const patch2 = doc.make_patch(doc2);
    expect(patch2).toEqual([1, [{ key: "cocalc", value: { two: "two" } }]]);

    let doc3 = doc.set({ key: "cocalc", value: null });
    doc3 = doc3.set({ key: "cocalc", value: { two: "two" } });
    expect(doc3.to_str()).toBe('{"key":"cocalc","value":{"two":"two"}}');
    const patch3 = doc.make_patch(doc3);
    expect(patch3).toEqual([
      1,
      [{ key: "cocalc", value: { five: null, one: null, two: "two" } }],
    ]);
    expect(doc.apply_patch(patch3).is_equal(doc3)).toBe(true);
  });

  it("array patch is atomic", () => {
    const doc = new ImmerDBDocument(new Set(["key"]), new Set([]), [
      { key: "cocalc", value: [1, 2, 5] },
    ]);

    const doc2 = doc.set({ key: "cocalc", value: [1, "2", 5] });
    expect(doc2.to_str()).toBe('{"key":"cocalc","value":[1,"2",5]}');

    const patch2 = doc.make_patch(doc2);
    expect(patch2).toEqual([1, [{ key: "cocalc", value: [1, "2", 5] }]]);
  });

  it("string column runtime type checking works", () => {
    const doc = new ImmerDBDocument(
      new Set(["key"]),
      new Set(["value"]),
      [{ key: "cocalc", value: "a string" }],
    );

    const doc2 = doc.set({ value: "foo" });
    const x = doc2.get_one({})!;
    expect(x.value).toBe("foo");

    expect(() => doc2.set({ value: 0 })).toThrow("must be a string");
  });
});

describe("ImmerDBDocument conversions", () => {
  it("makes a doc with various data types", () => {
    const doc = new ImmerDBDocument(new Set(["key"]), new Set([]), [
      {
        key: "cocalc",
        string: "cocalc",
        number: 389,
        map: { lat: 5, long: 7 },
        list: ["milk", "cookies", { a: true }],
        boolean: true,
      },
      { key: [1, { a: 5 }], number: 37 },
    ]);

    const s = doc.to_str();
    expect(s).toBe(
      '{"boolean":true,"key":"cocalc","list":["milk","cookies",{"a":true}],"map":{"lat":5,"long":7},"number":389,"string":"cocalc"}\n{"key":[1,{"a":5}],"number":37}',
    );

    const doc2 = from_str(s, ["key"], []);
    expect(doc2.is_equal(doc)).toBe(true);

    const doc3 = from_str(s, ["key"], ["string"]);
    expect(doc3.is_equal(doc)).toBe(true);
    const doc4 = from_str(s, ["key", "number"], []);
    expect(doc4.is_equal(doc)).toBe(true);
  });
});

describe("ImmerDBDocument with compound primary key", () => {
  const doc = new ImmerDBDocument(new Set(["table", "id"]), new Set([]), [
    {
      table: "accounts",
      id: 123,
      name: "CoCalc User",
    },
    { table: "projects", id: 123, title: "Test project" },
  ]);

  it("tests searches", () => {
    expect(doc.get({ table: "accounts", id: 123 })).toEqual([
      { id: 123, name: "CoCalc User", table: "accounts" },
    ]);
    expect(doc.get({ table: "projects", id: 123 })).toEqual([
      { id: 123, table: "projects", title: "Test project" },
    ]);

    expect(doc.get({ table: "accounts", id: "123" })).toEqual([]);
  });

  it("tests set of two records (one change and one create)", () => {
    const doc2 = doc.set([
      { table: "accounts", id: 123, name: "CoCalc Sage" },
      { table: "accounts", id: 124, name: "Sage Math" },
    ]);
    expect(doc2.get({ table: "accounts" })).toEqual([
      { id: 123, name: "CoCalc Sage", table: "accounts" },
      { id: 124, name: "Sage Math", table: "accounts" },
    ]);
  });
});
