/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { DBDocument, from_str } from "../doc";
import { fromJS } from "immutable";

describe("create a DBDocument with one primary key, and call methods on it", () => {
  let doc: DBDocument;
  const records = fromJS([
    { key: "cocalc", value: "sagemath" },
    { key: "cloud", value: "collaboration" },
  ]);

  it("creates the db-doc", () => {
    doc = new DBDocument(new Set(["key"]), new Set([]), records);
    expect(`${doc}`).toBe("[object Object]");
  });

  it("convert to string", () => {
    expect(doc.to_str()).toBe(
      '{"key":"cloud","value":"collaboration"}\n{"key":"cocalc","value":"sagemath"}'
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
      doc.is_equal(new DBDocument(new Set(["key"]), new Set([]), records))
    ).toBe(true);
    expect(doc.is_equal(new DBDocument(new Set(["key"]), new Set([])))).toBe(
      false
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

    // Let's also make a patch in the other direction from doc2 to doc:
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
    expect(x.toJS()).toEqual({ key: "cloud", value: "collaboration" });

    // can only search on primary keys
    expect(() => doc.get_one({ value: "collaboration" })).toThrow(
      "must be a primary key"
    );

    x = doc.get_one({});
    if (x == null) throw Error("bug");
    expect(x.toJS()).toEqual({ key: "cocalc", value: "sagemath" });
  });

  it("tests get", () => {
    expect(doc.get({}).toJS()).toEqual([
      { key: "cocalc", value: "sagemath" },
      { key: "cloud", value: "collaboration" },
    ]);
    expect(doc.get({ key: "cloud" }).toJS()).toEqual([
      { key: "cloud", value: "collaboration" },
    ]);

    // can only search on primary keys
    expect(() => doc.get({ value: "collaboration" })).toThrow(
      "must be a primary key"
    );
  });

  it("tests delete", () => {
    const doc2 = doc.delete({ key: "cloud" });
    expect(doc2.to_str()).toBe('{"key":"cocalc","value":"sagemath"}');
  });

  it("tests set changing a field", () => {
    const doc2 = doc.set({ key: "cloud", value: "computing" });
    expect(doc2.get({ key: "cloud" }).toJS()).toEqual([
      { key: "cloud", value: "computing" },
    ]);
  });

  it("tests set adding a new field", () => {
    const doc2 = doc.set({ key: "cloud", other: [1, 2, 3] });
    expect(doc2.get({ key: "cloud" }).toJS()).toEqual([
      { key: "cloud", other: [1, 2, 3], value: "collaboration" },
    ]);
  });
});

describe("test various types of patches", () => {
  it("string patch -- atomic", () => {
    const doc = new DBDocument(
      new Set(["key"]),
      new Set([]),
      fromJS([{ key: "cocalc", value: "a string" }])
    );
    const patch = doc.make_patch(
      doc.set({ key: "cocalc", value: "a different string" })
    );
    expect(patch).toEqual([
      1,
      [{ key: "cocalc", value: "a different string" }],
    ]);

    // And deleting that field:
    const patch2 = doc.make_patch(doc.set({ key: "cocalc", value: null }));
    expect(patch2).toEqual([1, [{ key: "cocalc", value: null }]]);
    // And yes, it's really deleted:
    expect(doc.apply_patch(patch2).to_str()).toBe('{"key":"cocalc"}');
  });

  it("string patch -- diff", () => {
    const doc = new DBDocument(
      new Set(["key"]),
      new Set(["value"]) /* so uses diffs */,
      fromJS([{ key: "cocalc", value: "a string" }])
    );
    const patch = doc.make_patch(
      doc.set({ key: "cocalc", value: "a different string" })
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

    // And deleting that field, is the same still:
    const patch2 = doc.make_patch(doc.set({ key: "cocalc", value: null }));
    expect(patch2).toEqual([1, [{ key: "cocalc", value: null }]]);
  });

  it("map patch -- our efficient about diffs (NOT atomic)", () => {
    const doc = new DBDocument(
      new Set(["key"]),
      new Set([]),
      fromJS([{ key: "cocalc", value: { one: 1, two: 2, five: 5 } }])
    );

    // This really sets just the two part:
    const doc2 = doc.set({ key: "cocalc", value: { two: "two" } });
    expect(doc2.to_str()).toBe(
      '{"key":"cocalc","value":{"five":5,"one":1,"two":"two"}}'
    );

    // That's why this patch can be compact:
    const patch2 = doc.make_patch(doc2);
    expect(patch2).toEqual([1, [{ key: "cocalc", value: { two: "two" } }]]);

    // To completely change the value atomically of a map,
    // you have to set to null (deleting that field),
    // then set the new value:
    let doc3 = doc.set({ key: "cocalc", value: null });
    doc3 = doc3.set({ key: "cocalc", value: { two: "two" } });
    expect(doc3.to_str()).toBe('{"key":"cocalc","value":{"two":"two"}}');
    const patch3 = doc.make_patch(doc3);
    // It's smart and just puts the deletes in as null setting, rather than
    // using the two steps we did above:
    expect(patch3).toEqual([
      1,
      [{ key: "cocalc", value: { five: null, one: null, two: "two" } }],
    ]);
    // And confirm this patch "works":
    expect(doc.apply_patch(patch3).is_equal(doc3)).toBe(true);
  });

  it("array patches are just stupidly atomic", () => {
    const doc = new DBDocument(
      new Set(["key"]),
      new Set([]),
      fromJS([{ key: "cocalc", value: [1, 2, 5] }])
    );

    // This really sets just the two part:
    const doc2 = doc.set({ key: "cocalc", value: [1, "2", 5] });
    expect(doc2.to_str()).toBe('{"key":"cocalc","value":[1,"2",5]}');

    // The patch is NOT in any way **compact** -- it just
    // sets the whole array.
    const patch2 = doc.make_patch(doc2);
    expect(patch2).toEqual([1, [{ key: "cocalc", value: [1, "2", 5] }]]);
  });

  it("tests that string column runtime type checking works", () => {
    // This checks that https://github.com/sagemathinc/cocalc/issues/3625
    // is fixed.
    const doc = new DBDocument(
      new Set(["key"]),
      new Set(["value"]) /* so must always be a string */,
      fromJS([{ key: "cocalc", value: "a string" }])
    );

    const doc2 = doc.set({ value: "foo" });
    const x = doc2.get_one({})!;
    expect(x.get("value")).toBe("foo");

    expect(() => doc2.set({ value: 0 })).toThrow("must be a string");
  });
});

describe("test conversion to and *from* strings", () => {
  it("makes a doc with various data types", () => {
    const doc = new DBDocument(
      new Set(["key"]),
      new Set([]),
      fromJS([
        {
          key: "cocalc",
          string: "cocalc",
          number: 389,
          map: { lat: 5, long: 7 },
          list: ["milk", "cookies", { a: true }],
          boolean: true,
        },
        { key: [1, { a: 5 }], number: 37 },
      ])
    );

    const s = doc.to_str();
    expect(s).toBe(
      '{"boolean":true,"key":"cocalc","list":["milk","cookies",{"a":true}],"map":{"lat":5,"long":7},"number":389,"string":"cocalc"}\n{"key":[1,{"a":5}],"number":37}'
    );

    const doc2 = from_str(s, ["key"], []);
    expect(doc2.is_equal(doc)).toBe(true);

    // Equality testing ignores primary
    // keys and string cols, since it's assumed
    // that Documents are only compared when
    // these are the same, since the application
    // is to SyncDoc.
    const doc3 = from_str(s, ["key"], ["string"]);
    expect(doc3.is_equal(doc)).toBe(true);
    const doc4 = from_str(s, ["key", "number"], []);
    expect(doc4.is_equal(doc)).toBe(true);
  });
});

describe("test using a compound primary key", () => {
  // Using a compound primary key lets you have several
  // separate database tables in the same db-doc.

  const doc = new DBDocument(
    new Set(["table", "id"]),
    new Set([]),
    fromJS([
      {
        table: "accounts",
        id: 123,
        name: "CoCalc User",
      },
      { table: "projects", id: 123, title: "Test project" },
    ])
  );

  it("tests searches", () => {
    expect(doc.get({ table: "accounts", id: 123 }).toJS()).toEqual([
      { id: 123, name: "CoCalc User", table: "accounts" },
    ]);
    expect(doc.get({ table: "projects", id: 123 }).toJS()).toEqual([
      { id: 123, table: "projects", title: "Test project" },
    ]);

    // type does matter
    expect(doc.get({ table: "accounts", id: "123" }).toJS()).toEqual([]);
  });

  it("tests doing a set of two records (one change and one create)", () => {
    const doc2 = doc.set([
      { table: "accounts", id: 123, name: "CoCalc Sage" },
      { table: "accounts", id: 124, name: "Sage Math" },
    ]);
    expect(doc2.get({ table: "accounts" }).toJS()).toEqual([
      { id: 123, name: "CoCalc Sage", table: "accounts" },
      { id: 124, name: "Sage Math", table: "accounts" },
    ]);
  });
});
