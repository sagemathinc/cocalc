/*
 *  This file is part of CoCalc: Copyright © 2020–2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { filesystem_bucket } from "./filesystem-bucket";

describe("filesystem_bucket", () => {
  let dir: string;
  let bucket: ReturnType<typeof filesystem_bucket>;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "cocalc-fs-bucket-"));
    bucket = filesystem_bucket({ name: dir });
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("requires a bucket name", () => {
    expect(() => filesystem_bucket({ name: "" as any })).toThrow(
      "bucket name must be specified",
    );
  });

  it("builds blob paths with the bucket root", () => {
    expect(bucket.blob_path("a.txt")).toBe(`${dir}/a.txt`);
  });

  it("writes and reads content", async () => {
    const content = Buffer.from("hello");
    await new Promise<void>((resolve, reject) => {
      bucket.write({
        name: "file.txt",
        content,
        cb: (err) => (err ? reject(err) : resolve()),
      });
    });

    const read = await new Promise<Buffer>((resolve, reject) => {
      bucket.read({
        name: "file.txt",
        cb: (err, data) => (err ? reject(err) : resolve(data as Buffer)),
      });
    });

    expect(read.equals(content)).toBe(true);
  });

  it("deletes content", async () => {
    await new Promise<void>((resolve, reject) => {
      bucket.write({
        name: "delete.txt",
        content: "bye",
        cb: (err) => (err ? reject(err) : resolve()),
      });
    });

    await new Promise<void>((resolve, reject) => {
      bucket.delete({
        name: "delete.txt",
        cb: (err) => (err ? reject(err) : resolve()),
      });
    });

    await new Promise<void>((resolve) => {
      bucket.read({
        name: "delete.txt",
        cb: (err) => {
          expect(err).toBeTruthy();
          resolve();
        },
      });
    });
  });
});
