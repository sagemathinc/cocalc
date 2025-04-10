import { toCompressedJSON, fromCompressedJSON } from "./compressed-json";
import { writeFile, unlink } from "fs/promises";
import { execSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { writeFileLz4 } from "./util";

describe("test basic compression in memory", () => {
  it("it compresses and decompresses an object", async () => {
    const obj = { cocalc: "sagemath", v: [1, 2, 7] };
    const c = await toCompressedJSON(obj);
    const d = await fromCompressedJSON(c);
    expect(d).toEqual(obj);
  });

  it("compresses a large object and observes the result is small", async () => {
    const obj = { cocalc: "sagemath".repeat(10000), v: [1, 2, 7] };
    const c = await toCompressedJSON(obj);
    const d = await fromCompressedJSON(c);
    expect(d).toEqual(obj);
    expect(c.length).toBeLessThan(1000);
  });
});

describe("test compression is compatible with command line lz4", () => {
  it("compression output is compatible with lz4 tool", async () => {
    const obj = { cocalc: "sagemath" };
    const c = await toCompressedJSON(obj);

    // Write c to a temporary file ending in .lz4
    const tempFilePath = join(tmpdir(), `tempfile.lz4`);
    await writeFile(tempFilePath, c);

    try {
      // Run command line "lz4 -t tempfile.lz4" in subprocess and confirm exit code 0
      execSync(`lz4 -t ${tempFilePath}`);
    } catch (error) {
      throw new Error(`lz4 command failed: ${error.message}`);
    } finally {
      // Clean up the temporary file
      await unlink(tempFilePath);
    }
  });
});

describe("test compression using writeFileLz4 is compatible with command line lz4", () => {
  it("compression output is compatible with lz4 tool and content is 'hello'", async () => {
    // Write "hello" to a temporary file ending in .lz4
    const tempFilePath = join(tmpdir(), `tempfile.lz4`);
    await writeFileLz4(tempFilePath, "hello");

    try {
      // Run command line "lz4 -dc tempfile.lz4" in subprocess and check the output
      const output = execSync(`lz4 -dc ${tempFilePath}`).toString().trim();
      expect(output).toBe("hello");
    } catch (error) {
      throw new Error(`lz4 command failed: ${error.message}`);
    } finally {
      // Clean up the temporary file
      await unlink(tempFilePath);
    }
  });
});
