import syncstring from "@cocalc/backend/conat/sync-doc/syncstring";

describe("basic tests of a syncstring", () => {
  let s;

  it("creates a syncstring", async () => {
    s = await syncstring();
  });

  it("initially it is empty", () => {
    expect(s.to_str()).toBe("");
    expect(s.versions().length).toBe(0);
  });

  it("set the value", () => {
    s.from_str("test");
    expect(s.to_str()).toBe("test");
    expect(s.versions().length).toBe(0);
  });

  it("commit the value", () => {
    s.commit();
    expect(s.versions().length).toBe(1);
  });

  it("change the value and commit a second time", () => {
    s.from_str("bar");
    s.commit();
    expect(s.versions().length).toBe(2);
  });

  it("get first version", () => {
    expect(s.version(s.versions()[0]).to_str()).toBe("test");
  });
});
