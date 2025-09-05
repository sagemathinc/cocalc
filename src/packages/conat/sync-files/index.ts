import { type Client } from "@cocalc/conat/core/client";
import { type ProjectApi, projectApiClient } from "@cocalc/conat/project/api";
import { refCacheSync } from "@cocalc/util/refcache";

interface Options {
  project_id: string;
  compute_server_id: number;
  client: Client;
}

export class SyncFiles {
  private api: ProjectApi;

  constructor(private opts: Options) {
    this.api = projectApiClient({ ...this.opts, timeout: 15_000 });
  }

  private mutagen = async (
    args: string[],
  ): Promise<{ stdout: string; stderr: string }> => {
    const { stdout, stderr, code } = await this.api.sync.mutagen(args);
    if (code) {
      throw new Error(Buffer.from(stderr).toString());
    }
    return {
      stdout: Buffer.from(stdout).toString(),
      stderr: Buffer.from(stderr).toString(),
    };
  };

  close = () => {};

  private getRemotePath = async ({
    project_id,
    path,
  }: {
    remote: Client;
    project_id: string;
    path: string;
  }) => {
    // - generate ssh key pair locally, if necessary  (in ~/.cocalc/mutagen ?)
    // - ensure remote has our ssh key and determine what the remote ssh target is

    // hard code for now
    const remotePath = `/home/wstein/build/cocalc-lite/src/data/btrfs/mnt/project-${project_id}/${path}`;
    return remotePath;
  };

  // Sync path between us and path on the remote.  Here remote
  // is a connection with user = {project_id:...} that we get
  // using a project specific api key.
  create = async ({
    remote,
    project_id,
    path,
    localPath,
  }: {
    remote: Client;
    project_id: string;
    path: string;
    localPath?: string;
  }) => {
    const remotePath = await this.getRemotePath({ remote, project_id, path });
    localPath ??= path;
    console.log({ localPath, remotePath });
    // - create the sync rule using mutagen
    const x = await this.mutagen(["sync", "create", localPath, remotePath]);
    return x;
  };

  list = async () => {
    const { stdout } = await this.mutagen([
      "sync",
      "list",
      "-l",
      "--template='{{ json . }}'",
    ]);
    return JSON.parse(stdout.slice(1, -2));
  };
}

export const syncFiles = refCacheSync<
  Options & { noCache?: boolean },
  SyncFiles
>({
  name: "sync-files",
  createKey: ({ project_id, compute_server_id, client }: Options) =>
    JSON.stringify([project_id, compute_server_id, client.id]),
  createObject: (opts: Options & { noCache?: boolean }) => {
    return new SyncFiles(opts);
  },
});
