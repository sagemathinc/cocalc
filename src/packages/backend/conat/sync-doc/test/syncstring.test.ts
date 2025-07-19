import syncstring from "@cocalc/backend/conat/sync-doc/syncstring";
import { before, after, getFS, uuid, wait, connect } from "./setup";

beforeAll(before);
afterAll(after);

describe("loading/saving syncstring to disk and setting values", () => {
  let s;
  const project_id = uuid();
  let fs, conat;

  it("creates the fs client", () => {
    conat = connect();
    fs = getFS(project_id, conat);
  });

  it("a syncstring associated to a file that does not exist on disk is initialized to the empty string", async () => {
    s = await syncstring({ fs, project_id, path: "new.txt", conat });
    expect(s.to_str()).toBe("");
    expect(s.versions().length).toBe(0);
    s.close();
  });

  it("a syncstring for editing a file that already exists on disk is initialized to that file", async () => {
    fs = getFS(project_id, conat);
    await fs.writeFile("a.txt", "hello");
    s = await syncstring({ fs, project_id, path: "a.txt", conat });
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

  it("save value to disk", async () => {
    await s.save_to_disk();
    const disk = await fs.readFile("a.txt", "utf8");
    expect(disk).toEqual("test");
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

describe("synchronized editing with two copies of a syncstring", () => {
  const project_id = uuid();
  let s1, s2, fs1, fs2, client1, client2;

  it("creates the fs client and two copies of a syncstring", async () => {
    client1 = connect();
    client2 = connect();
    fs1 = getFS(project_id, client1);
    s1 = await syncstring({
      fs: fs1,
      project_id,
      path: "a.txt",
      conat: client1,
    });
    fs2 = getFS(project_id, client2);
    s2 = await syncstring({
      fs: fs2,
      project_id,
      path: "a.txt",
      conat: client2,
    });
    expect(s1.to_str()).toBe("");
    expect(s2.to_str()).toBe("");
    expect(s1 === s2).toBe(false);
  });

  it("change one, commit and save, and see change reflected in the other", async () => {
    s1.from_str("hello world");
    s1.commit();
    await s1.save();
    await wait({
      until: () => {
        return s2.to_str() == "hello world";
      },
    });
  });

  it("change second and see change reflected in first", async () => {
    s2.from_str("hello world!");
    s2.commit();
    await s2.save();
    await wait({ until: () => s1.to_str() == "hello world!" });
  });

  it("view the history from each", async () => {
    expect(s1.versions().length).toEqual(2);
    expect(s2.versions().length).toEqual(2);

    const v1: string[] = [],
      v2: string[] = [];
    s1.show_history({ log: (x) => v1.push(x) });
    s2.show_history({ log: (x) => v2.push(x) });
    expect(v1).toEqual(v2);
  });
});
