import { type Client } from "@cocalc/conat/core/client";
import { type ProjectApi, projectApiClient } from "@cocalc/conat/project/api";
import { refCacheSync } from "@cocalc/util/refcache";

// a minutes -- some commands (e.g., flush) could take a long time.
const DEFAULT_TIMEOUT = 1000 * 60;

interface Options {
  project_id: string;
  compute_server_id: number;
  client: Client;
}

interface Selector {
  sessions?: string[];
  labelSelector?: string;
  all?: boolean;
}

export class SyncFiles {
  private api: ProjectApi;

  constructor(private opts: Options) {
    this.api = projectApiClient({ ...this.opts, timeout: DEFAULT_TIMEOUT });
  }

  // We use mutagen to implement filesystem sync.  We do not use it for
  // any port forwarding here.
  private mutagen = async (
    args: string[],
  ): Promise<{ stdout: string; stderr: string }> => {
    console.log("mutagen sync", args.join(" "));
    const { stdout, stderr, code } = await this.api.sync.mutagen([
      "sync",
      ...args,
    ]);
    if (code) {
      throw new Error(Buffer.from(stderr).toString());
    }
    return {
      stdout: Buffer.from(stdout).toString(),
      stderr: Buffer.from(stderr).toString(),
    };
  };

  private mutagenAction = async (
    action: string,
    opts: Selector,
    extraArgs?: string[],
  ) => {
    const { sessions = [], labelSelector, all } = opts;
    const args = [action, ...sessions];
    if (all) {
      args.push("--all");
    } else {
      if (labelSelector) {
        args.push("--label-selector", labelSelector);
      }
    }
    if (extraArgs) {
      args.push(...extraArgs);
    }
    return await this.mutagen(args);
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

    paused,
    label = {},
    resolve = "manual",

    ignore,
    ignoreVcs,
    noIgnoreVcs,

    maxFileSize,
  }: {
    remote: Client;

    project_id: string;
    path: string;

    localPath?: string;

    paused?: boolean;
    label?: { [key: string]: string };
    // resolve =
    //    - local -- all conflicts resolve to local
    //    - remote -- conflicts always resolve to remote
    //    - manual (default) -- conflicts must be manually resolved.
    resolve?: "local" | "remote" | "manual";

    ignore?: string[];
    ignoreVcs?: boolean;
    noIgnoreVcs?: boolean;

    maxFileSize?: string;
  }) => {
    const remotePath = await this.getRemotePath({ remote, project_id, path });
    localPath ??= path;
    console.log({ localPath, remotePath });
    // - create the sync rule using mutagen
    const args = ["create"];
    switch (resolve) {
      case "local":
        args.push(localPath, remotePath);
        args.push("--mode", "two-way-resolved");
        break;
      case "remote":
        args.push(remotePath, localPath);
        args.push("--mode", "two-way-resolved");
        break;
      case "manual":
        args.push(localPath, remotePath);
        break;
      default:
        throw new Error("resolve must be 'local', 'remote', or 'manual'");
    }
    args.push("--symlink-mode", "posix-raw");
    if (ignore) {
      for (const x of ignore) {
        args.push("--ignore", x);
      }
    }
    if (ignoreVcs) {
      args.push("--ignore-vcs");
    }
    if (noIgnoreVcs) {
      args.push("--no-ignore-vcs");
    }
    if (maxFileSize) {
      args.push("--max-staging-file-size", maxFileSize);
    }
    args.push("--no-global-configuration");
    args.push("--compression", "deflate");
    if (paused) {
      args.push("--paused");
    }
    if (label.project_id) {
      throw Error("project_id is always set automatically");
    }
    label.project_id = project_id;
    if (label.path) {
      throw Error("path is always set automatically");
    }
    label.path = path;
    for (const key in label) {
      args.push("--label", `${key}=${label[key]}`);
    }
    const x = await this.mutagen(args);
    return x;
  };

  list = async ({
    labelSelector,
  }: {
    // labelSelector uses exactly the same syntax as Kubernetes:
    // https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#list-and-watch-filtering
    labelSelector?: string;
  } = {}) => {
    const args = ["list", "-l", "--template='{{ json . }}'"];
    if (labelSelector) {
      args.push("--label-selector", labelSelector);
    }
    const { stdout } = await this.mutagen(args);
    return JSON.parse(stdout.slice(1, -2));
  };

  flush = async (opts: Selector & { skipWait?: boolean }) => {
    return await this.mutagenAction(
      "flush",
      opts,
      opts.skipWait ? ["--skip-wait"] : undefined,
    );
  };

  pause = async (opts: Selector) => await this.mutagenAction("pause", opts);

  reset = async (opts: Selector) => await this.mutagenAction("reset", opts);

  resume = async (opts: Selector) => await this.mutagenAction("resume", opts);

  terminate = async (opts: Selector) =>
    await this.mutagenAction("terminate", opts);
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
