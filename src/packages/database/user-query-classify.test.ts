import { isUserQueryWrite } from "./user-query-classify";

describe("isUserQueryWrite", () => {
  // --- Reads (has null leaves) ---
  it("simple read: {accounts: {first_name: null}}", () => {
    expect(isUserQueryWrite({ accounts: { first_name: null } })).toBe(false);
  });

  it("nested read: {accounts: {editor_settings: {theme: null}}}", () => {
    expect(
      isUserQueryWrite({ accounts: { editor_settings: { theme: null } } }),
    ).toBe(false);
  });

  it("deeply nested read: {accounts: {other_settings: {a: {b: {c: null}}}}}", () => {
    expect(
      isUserQueryWrite({
        accounts: { other_settings: { a: { b: { c: null } } } },
      }),
    ).toBe(false);
  });

  it("array multi-element read: {projects: [{project_id: null, title: null}]}", () => {
    expect(
      isUserQueryWrite({
        projects: [{ project_id: null, title: null }],
      }),
    ).toBe(false);
  });

  it("array read with multiple rows: {projects: [{...}, {...}]}", () => {
    expect(
      isUserQueryWrite({
        projects: [
          { project_id: "abc", title: null },
          { project_id: "def", title: null },
        ],
      }),
    ).toBe(false);
  });

  // --- Writes (all non-null leaves) ---
  it("simple write: {accounts: {first_name: 'X'}}", () => {
    expect(isUserQueryWrite({ accounts: { first_name: "X" } })).toBe(true);
  });

  it("nested write: {accounts: {editor_settings: {theme: 'dark'}}}", () => {
    expect(
      isUserQueryWrite({ accounts: { editor_settings: { theme: "dark" } } }),
    ).toBe(true);
  });

  it("array single-element write: {accounts: [{first_name: 'X'}]}", () => {
    expect(
      isUserQueryWrite({ accounts: [{ first_name: "X" }] }),
    ).toBe(true);
  });

  it("multi-row array write: {accounts: [{first_name: 'A'}, {first_name: 'B'}]}", () => {
    expect(
      isUserQueryWrite({
        accounts: [{ first_name: "A" }, { first_name: "B" }],
      }),
    ).toBe(true);
  });

  it("multi-row array with one null: read", () => {
    expect(
      isUserQueryWrite({
        accounts: [{ first_name: null }, { first_name: "B" }],
      }),
    ).toBe(true); // still a write — one element is a write
  });

  it("multi-row array all reads: read", () => {
    expect(
      isUserQueryWrite({
        projects: [{ project_id: null, title: null }, { project_id: null }],
      }),
    ).toBe(false);
  });

  // --- Batched queries ---
  it("batch with read then write: classifies as write", () => {
    expect(
      isUserQueryWrite([
        { accounts: { first_name: null } }, // read
        { accounts: { first_name: "X" } }, // write
      ]),
    ).toBe(true);
  });

  it("batch with all reads: classifies as read", () => {
    expect(
      isUserQueryWrite([
        { accounts: { first_name: null } },
        { projects: [{ project_id: null, title: null }] },
      ]),
    ).toBe(false);
  });

  // --- Edge cases ---
  it("empty object: not a write", () => {
    expect(isUserQueryWrite({})).toBe(false);
  });

  it("null: not a write", () => {
    expect(isUserQueryWrite(null)).toBe(false);
  });

  it("undefined: not a write", () => {
    expect(isUserQueryWrite(undefined)).toBe(false);
  });

  it("mixed nested: one branch null, other non-null → read", () => {
    expect(
      isUserQueryWrite({
        accounts: { first_name: "X", editor_settings: { theme: null } },
      }),
    ).toBe(false);
  });
});
