/*
Test async streaming writing of files to compute servers using NATS.


DEVELOPMENT:

  pnpm test ./write.test.ts

*/

import { before, after } from "@cocalc/backend/conat/test/setup";

beforeAll(before);

import { close, createServer, writeFile } from "@cocalc/conat/files/write";
import { createWriteStream, createReadStream } from "fs";
import { file as tempFile } from "tmp-promise";
import { writeFile as fsWriteFile, readFile } from "fs/promises";
import { sha1 } from "@cocalc/backend/sha1";
import { delay } from "awaiting";

describe("do a basic test that the file writing service works", () => {
  const project_id = "00000000-0000-4000-8000-000000000000";
  const compute_server_id = 0;
  it("create the write server", async () => {
    await createServer({
      project_id,
      compute_server_id,
      createWriteStream,
    });
  });

  let cleanups: any[] = [];
  const CONTENT = "cocalc";
  let source;
  it("creates the file we will read", async () => {
    const { path, cleanup } = await tempFile();
    source = path;
    await fsWriteFile(path, CONTENT);
    cleanups.push(cleanup);
  });

  let dest;
  it("write to a new file", async () => {
    const { path, cleanup } = await tempFile();
    dest = path;
    cleanups.push(cleanup);

    const stream = createReadStream(source);
    const { bytes, chunks } = await writeFile({
      stream,
      project_id,
      compute_server_id,
      path,
    });
    expect(chunks).toBe(1);
    expect(bytes).toBe(CONTENT.length);
  });

  it("confirm that the dest file is correct", async () => {
    await delay(50);
    const d = (await readFile(dest)).toString();
    expect(d).toEqual(CONTENT);
  });

  it("closes the write server", async () => {
    close({ project_id, compute_server_id });
    for (const f of cleanups) {
      f();
    }
  });
});

describe("do a more challenging test that involves a larger file that has to be broken into many chunks", () => {
  const project_id = "00000000-0000-4000-8000-000000000000";
  const compute_server_id = 1;

  it("create the write server", async () => {
    await createServer({
      project_id,
      compute_server_id,
      createWriteStream,
    });
  });

  let cleanups: any[] = [];
  let CONTENT = "";
  for (let i = 0; i < 1000000; i++) {
    CONTENT += `${i}`;
  }
  let source;
  it("creates the file we will read", async () => {
    const { path, cleanup } = await tempFile();
    source = path;
    await fsWriteFile(path, CONTENT);
    cleanups.push(cleanup);
  });

  let dest;
  it("write to a new file", async () => {
    const { path, cleanup } = await tempFile();
    dest = path;
    cleanups.push(cleanup);

    const stream = createReadStream(source);
    const { bytes, chunks } = await writeFile({
      stream,
      project_id,
      compute_server_id,
      path,
    });
    expect(chunks).toBeGreaterThan(1);
    expect(bytes).toBe(CONTENT.length);
  });

  it("confirm that the dest file is correct", async () => {
    const d = (await readFile(dest)).toString();
    expect(d.length).toEqual(CONTENT.length);
    // not directly comparing, since huge and if something goes wrong the output
    // saying the test failed is huge.
    expect(sha1(d)).toEqual(sha1(CONTENT));
  });

  it("closes the write server", async () => {
    close({ project_id, compute_server_id });
    for (const f of cleanups) {
      f();
    }
  });
});




afterAll(after);