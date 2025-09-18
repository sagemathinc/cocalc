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
    options: Options;
  }) => Promise<void>;
  // ensure a specific project is not running on this runner
  stop: (opts: { project_id: string; options: Options }) => Promise<void>;
  // get the status of a project here.
  status: (opts: {
    project_id: string;
    options: Options;
  }) => Promise<ProjectStatus>;
  // local -- the absolute path on the filesystem where the home directory of this
  // project should be mirrored.  This is typically basically scratch space, but
  // in case of a single server setup it could be the exact same path as the remote
  // files  The return value is a a path on the filesystem and whether or not
  // it has to be synchronized to the sshServer.  Calling localPath can, e.g.,
  // actually create the local path too (e.g,. as a btrfs volume).
  localPath: (opts: {
    project_id: string;
  }) => Promise<{ path: string; sync: boolean }>;
  // sshServer -- when the project runs it connects over ssh to this server to expose
  // ports and sync files.  host is of the form <address>:<port> and user
  // is the username the project should use, e.g., project-{project_id}
  sshServer: (opts: {
    project_id: string;
  }) => Promise<{ host: string; user: string }>;
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
      await start({ ...opts, options });
      const s = { server: id, state: "running" } as const;
      projects.set(opts.project_id, s);
      return s;
    },
    async stop(opts: { project_id: string }) {
      projects.set(opts.project_id, { server: id, state: "stopping" } as const);
      await stop({ ...opts, options });
      const s = { server: id, state: "opened" } as const;
      projects.set(opts.project_id, s);
      return s;
    },
    async status(opts: { project_id: string }) {
      const s = { ...(await status({ ...opts, options })), server: id };
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
