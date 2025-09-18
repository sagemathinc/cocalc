import { readFile, writeFile, mkdir } from "node:fs/promises";
import type { Sync, Forward } from "@cocalc/conat/project/runner/types";
import { join } from "node:path";

function getPath(home) {
  return join(home, ".mutagen", "cocalc");
}

export async function write({
  home = process.env.HOME,
  sync = [],
  forward = [],
}: {
  home?: string;
  sync?: Sync[];
  forward?: Forward[];
}) {
  const mutagen = getPath(home);
  await mkdir(mutagen, { recursive: true });
  const write = async (path, obj) => {
    await writeFile(join(mutagen, path), JSON.stringify(obj ?? []));
  };
  await Promise.all([write("sync.json", sync), write("forward.json", forward)]);
}

export async function read({
  home = process.env.HOME,
}: { home?: string } = {}): Promise<{ sync: Sync[]; forward: Forward[] }> {
  const mutagen = getPath(home);
  const read = async (path) => {
    try {
      return JSON.parse(await readFile(join(mutagen, path), "utf8"));
    } catch (err) {
      if (err.code == "ENOENT") {
        return [];
      } else {
        // corrupt file -- very serious
        throw err;
      }
    }
  };
  const [sync, forward] = await Promise.all([
    read("sync.json"),
    read("forward.json"),
  ]);
  return { sync, forward };
}
