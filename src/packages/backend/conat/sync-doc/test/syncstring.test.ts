import syncstring from "@cocalc/backend/conat/sync-doc/syncstring";
import { before, after, getFS, uuid } from "./setup";

beforeAll(before);
afterAll(after);

describe("basic tests of a syncstring", () => {
  let s;
  const project_id = uuid();
  let fs;

  it("creates the fs client", () => {
    fs = getFS(project_id);
  });

  it("a syncstring associated to a file that does not exist on disk is initialized to the empty string", async () => {
    s = await syncstring({ fs, project_id, path: "new.txt" });
    expect(s.to_str()).toBe("");
    expect(s.versions().length).toBe(0);
    s.close();
  });

  it("a syncstring for editing a file that already exists on disk is initialized to that file", async () => {
    fs = getFS(project_id);
    await fs.writeFile("a.txt", "hello");
    s = await syncstring({ fs, project_id, path: "a.txt" });
    expect(s.fs).not.toEqual(undefined);
  });

  it("initially it is 'hello'", () => {
    expect(s.to_str()).toBe("hello");
    expect(s.versions().length).toBe(1);
  });

  it("set the value", () => {
    s.from_str("test");
    expect(s.to_str()).toBe("test");
    expect(s.versions().length).toBe(1);
  });

  it("commit the value", () => {
    s.commit();
    expect(s.versions().length).toBe(2);
  });

  it("change the value and commit a second time", () => {
    s.from_str("bar");
    s.commit();
    expect(s.versions().length).toBe(3);
  });

  it("get first version", () => {
    expect(s.version(s.versions()[0]).to_str()).toBe("hello");
    expect(s.version(s.versions()[1]).to_str()).toBe("test");
  });
});
