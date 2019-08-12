import { Set } from "immutable";
import { is_implicitly_included } from "../helpers";

describe("Only inclusions", () => {
  test("Inclusion and path is root", () => {
    const path = "included/";
    const inclusions = Set<string>(["included/"]);
    const exclusions = Set<string>([]);
    const expectedResult = true;

    expect(is_implicitly_included(path, inclusions, exclusions)).toBe(
      expectedResult
    );
  });

  test("Inclusion is root; path is grandchild", () => {
    const path = "included/path/leaf";
    const inclusions = Set(["included/"]);
    const exclusions = Set<string>([]);
    const expectedResult = true;

    expect(is_implicitly_included(path, inclusions, exclusions)).toBe(
      expectedResult
    );
  });

  test("Inclusion is not root; path is grandchild", () => {
    const path = "included/path/child";
    const inclusions = Set(["included/path/", "not-considered/path/"]);
    const exclusions = Set<string>([]);
    const expectedResult = true;

    expect(is_implicitly_included(path, inclusions, exclusions)).toBe(
      expectedResult
    );
  });

  test("Inclusion is child of path", () => {
    const path = "included/path";
    const inclusions = Set(["included/path/child/", "included/sibling/path/"]);
    const exclusions = Set<string>([]);
    const expectedResult = false;

    expect(is_implicitly_included(path, inclusions, exclusions)).toBe(
      expectedResult
    );
  });

  test("Inclusion is grandchild of path", () => {
    const path = "included/path";
    const inclusions = Set([
      "included/path/child/grand-child/",
      "included/sibling/path/"
    ]);
    const exclusions = Set<string>([]);
    const expectedResult = false;

    expect(is_implicitly_included(path, inclusions, exclusions)).toBe(
      expectedResult
    );
  });
});

describe("Only exclusions", () => {
  test("Exclusion and path is root", () => {
    const path = "excluded/";
    const exclusions = Set(["excluded/"]);
    const inclusions = Set<string>([]);
    const expectedResult = false;

    expect(is_implicitly_included(path, inclusions, exclusions)).toBe(
      expectedResult
    );
  });

  test("Exclusion is root; path is grandchild", () => {
    const path = "excluded/path/leaf/";
    const exclusions = Set(["excluded/"]);
    const inclusions = Set<string>([]);
    const expectedResult = false;

    expect(is_implicitly_included(path, inclusions, exclusions)).toBe(
      expectedResult
    );
  });

  test("Exclusion is not root; path is grandchild", () => {
    const path = "excluded/path/child/";
    const exclusions = Set(["excluded/path/", "not-considered/path/"]);
    const inclusions = Set<string>([]);
    const expectedResult = false;

    expect(is_implicitly_included(path, inclusions, exclusions)).toBe(
      expectedResult
    );
  });

  test("Exclusion is child of path", () => {
    const path = "excluded/path/";
    const exclusions = Set(["excluded/path/child/", "excluded/sibling/path/"]);
    const inclusions = Set<string>([]);
    const expectedResult = false;

    expect(is_implicitly_included(path, inclusions, exclusions)).toBe(
      expectedResult
    );
  });

  test("Exclusion is grandchild of path", () => {
    const path = "excluded/path/";
    const exclusions = Set([
      "excluded/path/child/grand-child/",
      "excluded/sibling/path/"
    ]);
    const inclusions = Set<string>([]);
    const expectedResult = false;

    expect(is_implicitly_included(path, inclusions, exclusions)).toBe(
      expectedResult
    );
  });
});

describe("Inclusions and Exclusions", () => {
  test("path is not set but parent is excluded", () => {
    const path = "included/excluded/path/";
    const inclusions = Set(["included/"]);
    const exclusions = Set(["included/excluded/", "excluded/sibling/path/"]);
    const expectedResult = false;

    expect(is_implicitly_included(path, inclusions, exclusions)).toBe(
      expectedResult
    );
  });

  test("path is included but parent is excluded", () => {
    const path = "included/excluded/path-is-included/";
    const inclusions = Set(["included/", "included/excluded/path-is-included/"]);
    const exclusions = Set(["included/excluded/", "excluded/sibling/path/"]);
    const expectedResult = true;

    expect(is_implicitly_included(path, inclusions, exclusions)).toBe(
      expectedResult
    );
  });

  test("path is not included but parent is included", () => {
    const path = "included/excluded/included/path/";
    const inclusions = Set(["included/", "included/excluded/included/"]);
    const exclusions = Set(["included/excluded/", "excluded/sibling/path/"]);
    const expectedResult = true;

    expect(is_implicitly_included(path, inclusions, exclusions)).toBe(
      expectedResult
    );
  });
});
