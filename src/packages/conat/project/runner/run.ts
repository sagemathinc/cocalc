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
import type {
  LocalPathFunction,
  SshServersFunction,
  Configuration,
} from "./types";
import { getLogger } from "@cocalc/conat/client";

const logger = getLogger("conat:project:runner:run");

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
    config?: Configuration;
    localPath: LocalPathFunction;
    sshServers?: SshServersFunction;
  }) => Promise<void>;

  // ensure a specific project is not running on this runner, or
  // if project_id not given, stop all projects
  stop: (opts: {
    project_id?: string;
    localPath: LocalPathFunction;
    sshServers?: SshServersFunction;
    force?: boolean;
  }) => Promise<void>;

  // get the status of a project here.
  status: (opts: {
    project_id: string;
    localPath: LocalPathFunction;
    sshServers?: SshServersFunction;
  }) => Promise<ProjectStatus>;
  // local -- the absolute path on the filesystem where the home directory of this
  // project is hosted.  In case of a single server setup it could be the exact
  // same path as the remote files and no sync is involved.
  // Calling localPath may actually create the local path as a subvolume
  // too (e.g,. as a btrfs volume).
  localPath: LocalPathFunction;

  // sshServers -- when the project runs it connects over ssh to a server to expose
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
  sshServers?: SshServersFunction;
}

export interface API {
  start: (opts: {
    project_id: string;
    config?: Configuration;
  }) => Promise<ProjectStatus>;
  stop: (opts: {
    project_id: string;
    force?: boolean;
  }) => Promise<ProjectStatus>;
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
    async start(opts: { project_id: string; config?: Configuration }) {
      logger.debug("start", opts.project_id);
      projects.set(opts.project_id, { server: id, state: "starting" } as const);
      await start({
        ...opts,
        localPath: options.localPath,
        sshServers: options.sshServers,
      });
      const s = { server: id, state: "running" } as const;
      projects.set(opts.project_id, s);
      return s;
    },

    async stop(opts: { project_id: string; force?: boolean }) {
      logger.debug("stop", opts);
      projects.set(opts.project_id, { server: id, state: "stopping" } as const);
      try {
        await stop({
          ...opts,
          localPath: options.localPath,
          sshServers: options.sshServers,
        });
      } catch (err) {
        // couldn't stop it.
        projects.set(opts.project_id, {
          server: id,
          state: "running",
        } as const);
        throw err;
      }
      const s = { server: id, state: "opened" } as const;
      projects.set(opts.project_id, s);
      return s;
    },

    async status(opts: { project_id: string }) {
      logger.debug("status", opts.project_id);
      const s = {
        ...(await status({
          ...opts,
          localPath: options.localPath,
          sshServers: options.sshServers,
        })),
        server: id,
      };
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

export interface BasicOptions {
  client?: Client;
  timeout?: number;
  waitForInterest?: boolean;
}

export function client({
  client,
  project_id,
  subject,
  timeout,
  waitForInterest = true,
}:
  | (BasicOptions & {
      project_id?: string;
      subject: string;
    })
  | (BasicOptions & {
      project_id: string;
      subject?: string;
    })): API {
  subject ??= `project.${project_id}.run`;
  client ??= conat();
  // Note that the project_id field gets filled in automatically in the API
  // because the project above is of the form project.{project_id}.
  return client.call<API>(subject, { waitForInterest, timeout });
}
