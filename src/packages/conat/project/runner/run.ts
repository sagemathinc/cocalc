/*
Service to run a CoCalc project.

Tests are in

 - packages/backend/conat/test/project

*/

import { type Client } from "@cocalc/conat/core/client";
import { conat } from "@cocalc/conat/client";
import { randomId } from "@cocalc/conat/names";
import state, { type ProjectStatus } from "./state";
import { until } from "@cocalc/util/async-utils";

export const UPDATE_INTERVAL = 10_000;

export const COCALC_FILE_SERVER = "cocalc.file-server";

export type LocalPathFunction = (opts: {
  project_id: string;
}) => Promise<string>;

// Sync is exactly what mutagen takes.  Use the variable
// COCALC_FILE_SERVER defined above to refer to the remote server
// that you are syncing with.
export interface Sync {
  alpha: string;
  beta: string;
  flags?: string[];
}

// Forward is exactly what mutagen takes
export interface Forward {
  source: string;
  destination: string;
  flags?: string[];
}

export type SshServerFunction = (opts: { project_id: string }) => Promise<{
  host: string;
  port: number;
  user: string;
  sync?: Sync[];
  forward?: Forward[];
}>;

export interface Options {
  // client -- Client for the Conat cluster. State of this project runner gets saved here, and it
  // willl start a service listening here.
  client?: Client;
  // id -- the id of this project runner -- each project runner must have a different id,
  // so the load balancer knows where to place projects.
  id?: string;
  // start --- start the given project with the specified configuration.  The configuration
  // typically determines memory, disk spaces, the root filesystem image, etc.
  start: (opts: {
    project_id: string;
    config?: any;
    localPath: LocalPathFunction;
    sshServer: SshServerFunction;
  }) => Promise<void>;
  // ensure a specific project is not running on this runner
  stop: (opts: { project_id: string }) => Promise<void>;
  // get the status of a project here.

  status: (opts: { project_id: string }) => Promise<ProjectStatus>;
  // local -- the absolute path on the filesystem where the home directory of this
  // project is hosted.  In case of a single server setup it could be the exact
  // same path as the remote files and no sync is involved.
  // Calling localPath may actually create the local path as a subvolume
  // too (e.g,. as a btrfs volume).
  localPath: LocalPathFunction;

  // sshServer -- when the project runs it connects over ssh to a server to expose
  // ports and sync files.  The sshServer function locates this server and provides
  // the initial file sync and port forward configuration.
  //    - host, port - identifies the server from the point of view of the pod, e.g.,
  //      use 'host.containers.internal' on podman on a single server, rather than
  //      'localhost', for the 'pasta' network option.
  //    - user - the username the project should use to connect, which must identify
  //      the project somehow to the ssh server
  //    - sync - initial filesystem sync configuration, if needed.
  //      This is not needed on a single server deployment, but is very much needed
  //      when project run on a different machine than the file server.  For a compute
  //      server it would be the list of directories to sync on startup.
  //    - forward - initial port forward configuration.
  sshServer: SshServerFunction;
}

export interface API {
  start: (opts: { project_id: string; config?: any }) => Promise<ProjectStatus>;
  stop: (opts: { project_id: string }) => Promise<ProjectStatus>;
  status: (opts: { project_id: string }) => Promise<ProjectStatus>;
}

export async function server(options: Options) {
  options.id ??= randomId();
  options.client ??= conat();

  const { id, client, start, stop, status } = options;
  const { projects, runners } = await state({ client });
  let running = true;

  until(
    () => {
      if (!running) {
        return true;
      }
      runners.set(id, { time: Date.now() });
      return false;
    },
    { min: UPDATE_INTERVAL, max: UPDATE_INTERVAL },
  );

  const sub = await client.service<API>(`project-runner.${id}`, {
    async start(opts: { project_id: string; config?: any }) {
      projects.set(opts.project_id, { server: id, state: "starting" } as const);
      await start({ ...opts, ...options });
      const s = { server: id, state: "running" } as const;
      projects.set(opts.project_id, s);
      return s;
    },
    async stop(opts: { project_id: string }) {
      projects.set(opts.project_id, { server: id, state: "stopping" } as const);
      await stop(opts);
      const s = { server: id, state: "opened" } as const;
      projects.set(opts.project_id, s);
      return s;
    },
    async status(opts: { project_id: string }) {
      const s = { ...(await status(opts)), server: id };
      projects.set(opts.project_id, s);
      return s;
    },
  });

  return {
    close: () => {
      running = false;
      runners.delete(id);
      sub.close();
    },
  };
}

export function client({
  client,
  subject,
}: {
  client?: Client;
  subject: string;
}): API {
  client ??= conat();
  return client.call<API>(subject, { waitForInterest: true });
}
