import { localPathFileserver } from "../local-path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "path";
import { fsClient } from "@cocalc/conat/files/fs";

let tempDir;
beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cocalc-local-path"));
});

describe("use the simple fileserver", () => {
  let service;
  it("creates the simple fileserver service", async () => {
    service = await localPathFileserver({ service: "fs", path: tempDir });
  });

  const project_id = "6b851643-360e-435e-b87e-f9a6ab64a8b1";
  let fs;
  it("create a client", () => {
    fs = fsClient({ subject: `fs.project-${project_id}` });
  });

  it("checks appendFile works", async () => {
    await fs.appendFile("a", "foo");
    expect(await fs.readFile("a", "utf8")).toEqual("foo");
  });

  it("checks chmod works", async () => {
    await fs.writeFile("b", "hi");
    await fs.chmod("b", 0o755);
    const s = await fs.stat("b");
    expect(s.mode.toString(8)).toBe("100755");
  });

  it("closes the service", () => {
    service.close();
  });
});

afterAll(async () => {
  await rm(tempDir, { force: true, recursive: true });
});
