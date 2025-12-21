import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { which } from "./which";

describe("which", () => {
  const originalPath = process.env.PATH;

  afterEach(() => {
    process.env.PATH = originalPath;
  });

  it("resolves a binary from PATH when present", async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), "which-test-"));
    const bin = join(dir, "fakebin");
    await fs.writeFile(bin, "echo hello\n");
    process.env.PATH = `${dir}${originalPath ? `:${originalPath}` : ""}`;

    const resolved = await which("fakebin");
    expect(resolved).toBe(bin);
  });

  it("returns null when the binary is not found", async () => {
    process.env.PATH = "";
    const resolved = await which("definitely-not-a-real-bin");
    expect(resolved).toBeNull();
  });
});
