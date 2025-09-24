import { type Client } from "@cocalc/conat/core/client";
import { type ProjectApi, projectApiClient } from "@cocalc/conat/project/api";
import { refCacheSync } from "@cocalc/util/refcache";

const DEFAULT_TIMEOUT = 1000 * 15;

export interface Options {
  project_id: string;
  compute_server_id: number;
  client: Client;
}

export interface Selector {
  name?: string;
  sessions?: string[];
  labelSelector?: string;
  all?: boolean;
}

export class MutagenForward {
  private api: ProjectApi;

  constructor(private opts: Options) {
    this.api = projectApiClient({ ...this.opts, timeout: DEFAULT_TIMEOUT });
  }

  // We use mutagen to implement filesystem sync.  We do not use it for
  // any port forwarding here.
  private mutagen = async (
    args: string[],
  ): Promise<{ stdout: string; stderr: string }> => {
    console.log("mutagen forward", args.join(" "));
    const { stdout, stderr, code } = await this.api.sync.mutagen([
      "forward",
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

  // create forward so any connection to source is actually sent on to destination.
  create = async (
    source: string,
    destination: string,
    {
      name,
      label,
      options,
    }: {
      name?: string;
      label?: { [key: string]: string };
      options?: string[];
    } = {},
  ) => {
    if (!source) {
      throw Error("source must be specified");
    }
    if (!destination) {
      throw Error("destination must be specified");
    }
    const args = ["create", source, destination];
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
    name,
  }: {
    name?: string;
    // labelSelector uses exactly the same syntax as Kubernetes:
    // https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#list-and-watch-filtering
    labelSelector?: string;
  } = {}) => {
    const args = ["list", "-l", "--template='{{ json . }}'"];
    if (name) {
      args.push(name);
    }
    if (labelSelector) {
      args.push("--label-selector", labelSelector);
    }
    const { stdout } = await this.mutagen(args);
    return JSON.parse(stdout.slice(1, -2));
  };

  pause = async (opts: Selector) => await this.mutagenAction("pause", opts);

  resume = async (opts: Selector) => await this.mutagenAction("resume", opts);

  terminate = async (opts: Selector) => {
    await this.mutagenAction("terminate", opts);
  };
}

export const mutagenForward = refCacheSync<
  Options & { noCache?: boolean },
  MutagenForward
>({
  name: "mutagen-forward",
  createKey: ({ project_id, compute_server_id, client }: Options) =>
    JSON.stringify([project_id, compute_server_id, client.id]),
  createObject: (opts: Options & { noCache?: boolean }) => {
    return new MutagenForward(opts);
  },
});
