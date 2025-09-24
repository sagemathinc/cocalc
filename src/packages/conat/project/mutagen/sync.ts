import { type ProjectApi, projectApiClient } from "@cocalc/conat/project/api";
import { refCacheSync } from "@cocalc/util/refcache";
import { type Selector, type Options } from "./forward";

// a minutes -- some commands (e.g., flush) could take a long time.
const DEFAULT_TIMEOUT = 1000 * 60;

export class MutagenSync {
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
    const { sessions = [], labelSelector, all, name } = opts;
    const args = [action, ...sessions];
    if (all) {
      args.push("--all");
    } else if (labelSelector) {
      args.push("--label-selector", labelSelector);
    } else if (name) {
      args.push(name);
    }
    if (extraArgs) {
      args.push(...extraArgs);
    }
    return await this.mutagen(args);
  };

  close = () => {};

  // Sync path between us and path on the remote.  Here remote
  // is a connection with user = {project_id:...} that we get
  // using a project specific api key.
  create = async (
    alpha,
    beta,
    {
      name,

      paused,
      label = {},

      ignore,
      ignoreVcs,
      noIgnoreVcs,

      symlinkMode = "posix-raw", // different default since usually what *WE* want.
      maxFileSize,
      options,
    }: {
      name?: string;

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

      symlinkMode?: string;
      maxFileSize?: string;

      options?: string[];
    } = {},
  ) => {
    if (!alpha) {
      throw Error("alpha must be specified");
    }
    if (!beta) {
      throw Error("beta must be specified");
    }
    const args = [alpha, beta];
    if (symlinkMode) {
      args.push("--symlink-mode", symlinkMode);
    }
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
    if (name) {
      args.push("--name", name);
    }
    for (const key in label) {
      args.push("--label", `${key}=${label[key]}`);
    }
    return await this.mutagen(args.concat(options ?? []));
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

export const mutagenSync = refCacheSync<
  Options & { noCache?: boolean },
  MutagenSync
>({
  name: "mutagen-sync",
  createKey: ({ project_id, compute_server_id, client }: Options) =>
    JSON.stringify([project_id, compute_server_id, client.id]),
  createObject: (opts: Options & { noCache?: boolean }) => {
    return new MutagenSync(opts);
  },
});
