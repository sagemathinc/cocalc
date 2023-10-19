/*
Manage a unionfs-cache'd remote mounted home directory.

This involves periodically syncing files between the compute
server and the project.

Key observation - because of latency, it is faster (and less data)
to create a compressed tarball, then tell the project to extract it,
instead of directly copy files around via the remote mount.

See ./unionfs-cache.md for a discussion of what this is.
*/

import getLogger from "@cocalc/backend/logger";
const logger = getLogger("compute:filesystem-cache");

interface Options {
  lower: string;
  upper: string;
  mount: string;
  project_id: string;
  compute_server_id: number;
}

export default function filesystemCache(opts: Options) {
  logger.debug("filesystemCache: ", opts);
  const cache = new FilesystemCache(opts);
  return cache;
}

class FilesystemCache {
  private lower: string;
  private upper: string;
  private mount: string;
  private project_id: string;
  private compute_server_id: number;

  constructor({ lower, upper, mount, project_id, compute_server_id }: Options) {
    this.lower = lower;
    this.upper = upper;
    this.mount = mount;
    this.project_id = project_id;
    this.compute_server_id = compute_server_id;
    logger.debug("created FilesystemCache");
  }

  close = async () => {
    // todo
    logger.debug("close FilesystemCache (TODO)");
  };
}
