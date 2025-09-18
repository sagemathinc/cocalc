import { writeFile, mkdir } from "node:fs/promises";
import type { Sync, Forward } from "@cocalc/conat/project/runner/run";
import { join } from "node:path";

export async function writeMutagenConfig({
  home,
  sync = [],
  forward = [],
}: {
  home: string;
  sync?: Sync[];
  forward?: Forward[];
}) {
  const mutagen = join(home, ".mutagen", "cocalc");
  await mkdir(mutagen, { recursive: true });
  await writeFile(join(mutagen, "sync.json"), JSON.stringify(sync ?? []));
  await writeFile(join(mutagen, "forward.json"), JSON.stringify(forward ?? []));
}
