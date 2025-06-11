import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { getLogger } from "@cocalc/project/logger";
import {
  createTerminalServer,
  type ConatService,
} from "@cocalc/conat/service/terminal";
import { project_id, compute_server_id } from "@cocalc/project/data";
import { isEqual } from "lodash";
import ensureContainingDirectoryExists from "@cocalc/backend/misc/ensure-containing-directory-exists";
import { Session } from "./session";
import {
  computeServerManager,
  ComputeServerManager,
} from "@cocalc/conat/compute/manager";
const logger = getLogger("project:conat:terminal:manager");

interface CreateOptions {
  env?: { [key: string]: string };
  command?: string;
  args?: string[];
  cwd?: string;
  ephemeral?: boolean;
}

let manager: TerminalManager | null = null;
export const createTerminalService = async (
  path: string,
  opts?: CreateOptions,
) => {
  if (manager == null) {
    logger.debug("createTerminalService -- creating manager");
    manager = new TerminalManager();
  }
  return await manager.createTerminalService(path, opts);
};

export class TerminalManager {
  private services: { [path: string]: ConatService } = {};
  private sessions: { [path: string]: Session } = {};
  private computeServers?: ComputeServerManager;

  constructor() {
    this.computeServers = computeServerManager({ project_id });
    this.computeServers.on("change", this.handleComputeServersChange);
  }

  private handleComputeServersChange = async ({ path, id = 0 }) => {
    const service = this.services[path];
    if (id != compute_server_id) {
      if (service == null) return;
      logger.debug(
        `terminal '${path}' moved: ${compute_server_id} --> ${id}:  Stopping`,
      );
      service.close();
      delete this.services[path];
      this.sessions[path]?.close();
      delete this.sessions[path];
    } else {
      if (service != null) return;
      logger.debug(`terminal '${path}' moved to us. Starting.`);
      // todo -- makes no sense
      try {
        await this.createTerminalService(path);
      } catch (err) {
        logger.debug(`WARNING: error creating terminal service -- ${err}`);
      }
    }
  };

  close = () => {
    logger.debug("close");
    if (this.computeServers == null) {
      return;
    }
    for (const path in this.services) {
      this.services[path].close();
    }
    this.services = {};
    this.sessions = {};
    this.computeServers.removeListener(
      "change",
      this.handleComputeServersChange,
    );
    this.computeServers.close();
    delete this.computeServers;
  };

  private getSession = async (
    path: string,
    options,
    noCreate?: boolean,
  ): Promise<Session> => {
    const cur = this.sessions[path];
    if (cur != null) {
      return cur;
    }
    if (noCreate) {
      throw Error("no terminal session");
    }
    await this.createTerminal({ ...options, path });
    const session = this.sessions[path];
    if (session == null) {
      throw Error(
        `BUG: failed to create terminal session - ${path} (this should not happen)`,
      );
    }
    return session;
  };

  createTerminalService = reuseInFlight(
    async (path: string, opts?: CreateOptions) => {
      if (this.services[path] != null) {
        return;
      }
      let options: any = undefined;

      const getSession = async (options, noCreate?) =>
        await this.getSession(path, options, noCreate);

      const impl = {
        create: async (
          opts: CreateOptions,
        ): Promise<{ success: "ok"; note?: string; ephemeral?: boolean }> => {
          console.log(new Date(), "terminal.create", path, opts);
          // save options to reuse.
          options = opts;
          const note = await this.createTerminal({ ...opts, path });
          return { success: "ok", note };
        },

        write: async (data: string): Promise<void> => {
          if (typeof data != "string") {
            throw Error(`data must be a string -- ${JSON.stringify(data)}`);
          }
          const session = await getSession(options);
          await session.write(data);
        },

        restart: async () => {
          const session = await getSession(options);
          await session.restart();
        },

        cwd: async () => {
          const session = await getSession(options);
          return await session.getCwd();
        },

        kill: async () => {
          try {
            const session = await getSession(options, true);
            await session.close();
          } catch {
            return;
          }
        },

        size: async (opts: {
          rows: number;
          cols: number;
          browser_id: string;
          kick?: boolean;
        }) => {
          const session = await getSession(options);
          session.setSize(opts);
        },

        close: async (browser_id: string) => {
          this.sessions[path]?.browserLeaving(browser_id);
        },
      };

      const server = createTerminalServer({ path, project_id, impl });

      server.on("close", () => {
        this.sessions[path]?.close();
        delete this.sessions[path];
        delete this.services[path];
      });

      this.services[path] = server;

      if (opts != null) {
        await impl.create(opts);
      }
    },
  );

  closeTerminal = (path: string) => {
    const cur = this.sessions[path];
    if (cur != null) {
      cur.close();
      delete this.sessions[path];
    }
  };

  createTerminal = reuseInFlight(
    async (params) => {
      if (params == null) {
        throw Error("params must be specified");
      }
      const { path, ...options } = params;
      if (!path) {
        throw Error("path must be specified");
      }
      await ensureContainingDirectoryExists(path);
      let note = "";
      const cur = this.sessions[path];
      if (cur != null) {
        if (!isEqual(cur.options, options) || cur.state == "closed") {
          // clean up -- we will make new one below
          this.closeTerminal(path);
          note += "Closed existing session. ";
        } else {
          // already have a working session with correct options
          note += "Already have working session with same options. ";
          return note;
        }
      }
      note += "Creating new session.";
      let session = new Session({ path, options });
      await session.init();
      if (session.state == "closed") {
        // closed during init -- unlikely but possible; try one more time
        session = new Session({ path, options });
        await session.init();
        if (session.state == "closed") {
          throw Error(`unable to create terminal session for ${path}`);
        }
      } else {
        this.sessions[path] = session;
        return note;
      }
    },
    {
      createKey: (args) => {
        return args[0]?.path ?? "";
      },
    },
  );
}
