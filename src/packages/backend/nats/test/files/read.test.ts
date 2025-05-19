/*
Test async streaming read of files from a compute servers using NATS.


DEVELOPMENT:

pnpm exec jest --watch --forceExit --detectOpenHandles "read.test.ts"

*/

import "@cocalc/backend/nats";
import { close, createServer, readFile } from "@cocalc/conat/files/read";
import { createReadStream } from "fs";
import { file as tempFile } from "tmp-promise";
import { writeFile as fsWriteFile } from "fs/promises";
import { sha1 } from "@cocalc/backend/sha1";

describe("do a basic test that the file read service works", () => {
  const project_id = "00000000-0000-4000-8000-000000000000";
  const compute_server_id = 0;
  it("create the read server", async () => {
    await createServer({
      project_id,
      compute_server_id,
      createReadStream,
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

  it("reads the file into memory", async () => {
    const r = await readFile({ project_id, compute_server_id, path: source });
    // will get just one chunk
    for await (const chunk of r) {
      expect(chunk.toString()).toEqual(CONTENT);
    }
  });

  it("closes the write server", async () => {
    close({ project_id, compute_server_id });
    for (const f of cleanups) {
      f();
    }
  });
});

describe("do a larger test that involves multiple chunks and a different name", () => {
  const project_id = "00000000-0000-4000-8000-000000000000";
  const compute_server_id = 0;
  const name = "b";
  it("create the read server", async () => {
    await createServer({
      project_id,
      compute_server_id,
      createReadStream,
      name,
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

  it("reads the file into memory", async () => {
    const r = await readFile({
      project_id,
      compute_server_id,
      path: source,
      name,
    });
    // will get many chunks.
    let chunks: any[] = [];
    for await (const chunk of r) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(1);
    const s = Buffer.concat(chunks).toString();
    expect(s.length).toBe(CONTENT.length);
    expect(sha1(s)).toEqual(sha1(CONTENT));
  });

  it("closes the write server", async () => {
    close({ project_id, compute_server_id, name });
    for (const f of cleanups) {
      f();
    }
  });
});
