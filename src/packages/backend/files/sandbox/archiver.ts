import Archiver from "archiver";
import { createWriteStream } from "fs";
import { stat } from "fs/promises";
import { once } from "@cocalc/util/async-utils";
import { type ArchiverOptions } from "@cocalc/conat/files/fs";
export { type ArchiverOptions };

export default async function archiver(
  path: string,
  paths: string[] | string,
  options?: ArchiverOptions,
) {
  if (options == null) {
    if (path.endsWith(".zip")) {
      options = { format: "zip" };
    } else if (path.endsWith(".tar")) {
      options = { format: "tar" };
    } else if (path.endsWith(".tar.gz")) {
      options = { format: "tar", gzip: true };
    }
  }
  if (typeof paths == "string") {
    paths = [paths];
  }
  const archive = new Archiver(options!.format, options);
  const output = createWriteStream(path);
  // docs say to listen before calling finalize
  const closed = once(output, "close");
  archive.pipe(output);

  let error: any = undefined;
  archive.on("error", (err) => {
    error = err;
  });

  const isDir = async (path) => (await stat(path)).isDirectory();
  const v = await Promise.all(paths.map(isDir));
  for (let i = 0; i < paths.length; i++) {
    if (v[i]) {
      archive.directory(paths[i]);
    } else {
      archive.file(paths[i]);
    }
  }

  await archive.finalize();
  await closed;
  if (error) {
    throw error;
  }
}
