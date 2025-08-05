import Archiver from "archiver";
import { createReadStream, createWriteStream } from "fs";
import { stat } from "fs/promises";
import { once } from "@cocalc/util/async-utils";
import { type ArchiverOptions } from "@cocalc/conat/files/fs";
export { type ArchiverOptions };

export default async function archiver(
  path: string,
  // map from absolute path to path as it should appear in the archive
  pathMap: { [absolutePath: string]: string | null },
  options?: ArchiverOptions,
) {
  options = { ...options };
  const format = getFormat(path, options);
  const archive = new Archiver(format, options);

  let error: any = undefined;

  const timer = options.timeout
    ? setTimeout(() => {
        error = `Timeout after ${options.timeout} ms`;
        archive.abort();
      }, options.timeout)
    : undefined;

  const output = createWriteStream(path);
  // docs say to listen before calling finalize
  const closed = once(output, "close");
  archive.pipe(output);

  archive.on("error", (err) => {
    error = err;
  });

  const paths = Object.keys(pathMap);
  const isDir = async (path) => (await stat(path)).isDirectory();
  const v = await Promise.all(paths.map(isDir));
  for (let i = 0; i < paths.length; i++) {
    const name = pathMap[paths[i]];
    if (v[i]) {
      archive.directory(paths[i], name);
    } else {
      archive.append(createReadStream(paths[i]), { name });
    }
  }

  archive.finalize();
  await closed;
  if (timer) {
    clearTimeout(timer);
  }
  if (error) {
    throw Error(error);
  }
}

function getFormat(path: string, options) {
  if (path.endsWith(".zip")) {
    return "zip";
  } else if (path.endsWith(".tar")) {
    return "tar";
  } else if (path.endsWith(".tar.gz")) {
    options.gzip = true;
    return "tar";
  }
}
