// to access the non-exported RESERVED object
process.env["NODE_DEV"] = "TEST";

import * as NR from "@cocalc/util/db-schema/name-rules";

describe("Check RESERVED", () => {
  const { RESERVED } = NR as any;
  const { isReserved } = NR;

  test("reserved names", () => {
    expect(RESERVED.has("admin")).toBe(true);
    expect(isReserved("admin")).toBe(true);
  });

  it.each(Array.from(RESERVED))(
    "'%s' must be lowercase and has no spaces",
    (name: string) => {
      expect(name).not.toEqual("");
      expect(name.indexOf(" ")).toBe(-1);
      expect(name.toLowerCase()).toBe(name);
      // entire name must be of a-z,A-Z,0-9,_,. or -
      expect(name).toMatch(/^[a-z\d\.\-_]+$/);
    },
  );
});

test("checkAccountName", () => {
  const { checkAccountName } = NR;

  expect(() =>
    checkAccountName("3b38dd9c-f8bf-48c0-9d26-7cad4bac08eb"),
  ).toThrow(/.*UUID.*/);

  expect(() => checkAccountName("foo--bar")).toThrow(/.*hyphens.*/);

  // not more than 39 characters
  expect(() =>
    checkAccountName("1234567890123456789012345678901234567890"),
  ).toThrow(/.*39.*/);

  // not less than 1 character
  expect(() => checkAccountName("")).toThrow(/.*1.*/);

  // not start with hyphen
  expect(() => checkAccountName("-foo")).toThrow(/.*hyphen.*/);

  // not be "compute"
  expect(() => checkAccountName("compute")).toThrow(/.*reserved.*/);
});

test("checkProjectName", () => {
  const { checkProjectName } = NR;

  // at most 100 characters
  expect(() =>
    checkProjectName(
      "12345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901",
    ),
  ).toThrow(/.*100.*/);

  // not less than 1 character
  expect(() => checkProjectName("")).toThrow(/.*1.*/);

  // not start with hyphen
  expect(() => checkProjectName("-foo")).toThrow(/.*hyphen.*/);

  // name must contain only a-z,A-Z,0-9, . or -, and not start with hyphen or have spaces
  expect(() => checkProjectName("foo bar")).toThrow(/.*spaces.*/);
  expect(() => checkProjectName("foo_bar")).toThrow(/.*spaces.*/);
  expect(() => checkProjectName("foo-bar")).not.toThrow(/.*spaces.*/);
  expect(() => checkProjectName("foo.bar")).not.toThrow(/.*spaces.*/);

  // not be a v4 UUID
  expect(() =>
    checkProjectName("3b38dd9c-f8bf-48c0-9d26-7cad4bac08eb"),
  ).toThrow(/.*UUID.*/);
});

test("checkPublicPathName", () => {
  const { checkPublicPathName } = NR;

  // at most 100 characters
  expect(() =>
    checkPublicPathName(
      "12345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901",
    ),
  ).toThrow(/.*100.*/);

  // not less than 1 character
  expect(() => checkPublicPathName("")).toThrow(/.*1.*/);

  // not start with hyphen
  expect(() => checkPublicPathName("-foo")).toThrow(/.*hyphen.*/);

  // name must contain only a-z,A-Z,0-9, . or -, and not start with hyphen or have spaces
  expect(() => checkPublicPathName("foo bar")).toThrow(/.*spaces.*/);
  expect(() => checkPublicPathName("foo_bar")).toThrow(/.*spaces.*/);
  expect(() => checkPublicPathName("foo-bar")).not.toThrow(/.*spaces.*/);
  expect(() => checkPublicPathName("foo.bar")).not.toThrow(/.*spaces.*/);

  // not be a UUID
  expect(() =>
    checkPublicPathName("3b38dd9c-f8bf-48c0-9d26-7cad4bac08eb"),
  ).toThrow(/.*UUID.*/);
});
