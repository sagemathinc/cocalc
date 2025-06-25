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
import type { CreateTerminalOptions } from "@cocalc/conat/project/api/editor";

let manager: TerminalManager | null = null;
export const createTerminalService = async (
  termPath: string,
  opts?: CreateTerminalOptions,
) => {
  if (manager == null) {
    logger.debug("createTerminalService -- creating manager");
    manager = new TerminalManager();
  }
  return await manager.createTerminalService(termPath, opts);
};

export function pidToPath(pid: number): string | undefined {
  return manager?.pidToPath(pid);
}

export class TerminalManager {
  private services: { [termPath: string]: ConatService } = {};
  private sessions: { [termPath: string]: Session } = {};
  private computeServers?: ComputeServerManager;

  constructor() {
    this.computeServers = computeServerManager({ project_id });
    this.computeServers.on("change", this.handleComputeServersChange);
  }

  private handleComputeServersChange = async ({ path: termPath, id = 0 }) => {
    const service = this.services[termPath];
    if (service == null) return;
    if (id != compute_server_id) {
      logger.debug(
        `terminal '${termPath}' moved: ${compute_server_id} --> ${id}:  Stopping`,
      );
      this.sessions[termPath]?.close();
      service.close();
      delete this.services[termPath];
      delete this.sessions[termPath];
    }
  };

  close = () => {
    logger.debug("close");
    if (this.computeServers == null) {
      return;
    }
    for (const termPath in this.services) {
      this.services[termPath].close();
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
    termPath: string,
    options,
    noCreate?: boolean,
  ): Promise<Session> => {
    const cur = this.sessions[termPath];
    if (cur != null) {
      return cur;
    }
    if (noCreate) {
      throw Error("no terminal session");
    }
    await this.createTerminal({ ...options, termPath });
    const session = this.sessions[termPath];
    if (session == null) {
      throw Error(
        `BUG: failed to create terminal session - ${termPath} (this should not happen)`,
      );
    }
    return session;
  };

  createTerminalService = reuseInFlight(
    async (termPath: string, opts?: CreateTerminalOptions) => {
      if (this.services[termPath] != null) {
        return;
      }
      let options: any = undefined;

      const getSession = async (options, noCreate?) =>
        await this.getSession(termPath, options, noCreate);

      const impl = {
        create: async (
          opts: CreateTerminalOptions,
        ): Promise<{ success: "ok"; note?: string; ephemeral?: boolean }> => {
          // save options to reuse.
          options = opts;
          const note = await this.createTerminal({ ...opts, termPath });
          return { success: "ok", note };
        },

        write: async (data: string): Promise<void> => {
          // logger.debug("received data", data.length);
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
            session.kill();
            session.close();
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
          this.sessions[termPath]?.browserLeaving(browser_id);
        },
      };

      const server = createTerminalServer({ termPath, project_id, impl });

      server.on("close", () => {
        this.sessions[termPath]?.close();
        delete this.sessions[termPath];
        delete this.services[termPath];
      });

      this.services[termPath] = server;

      if (opts != null) {
        await impl.create(opts);
      }
    },
  );

  closeTerminal = (termPath: string) => {
    const cur = this.sessions[termPath];
    if (cur != null) {
      cur.close();
      delete this.sessions[termPath];
    }
  };

  createTerminal = reuseInFlight(
    async (params) => {
      if (params == null) {
        throw Error("params must be specified");
      }
      const { termPath, ...options } = params;
      if (!termPath) {
        throw Error("termPath must be specified");
      }
      await ensureContainingDirectoryExists(termPath);
      let note = "";
      const cur = this.sessions[termPath];
      if (cur != null) {
        if (!isEqual(cur.options, options) || cur.state == "closed") {
          // clean up -- we will make new one below
          this.closeTerminal(termPath);
          note += "Closed existing session. ";
        } else {
          // already have a working session with correct options
          note += "Already have working session with same options. ";
          return note;
        }
      }
      note += "Creating new session.";
      let session = new Session({ termPath, options });
      await session.init();
      if (session.state == "closed") {
        // closed during init -- unlikely but possible; try one more time
        session = new Session({ termPath, options });
        await session.init();
        if (session.state == "closed") {
          throw Error(`unable to create terminal session for ${termPath}`);
        }
      } else {
        this.sessions[termPath] = session;
        return note;
      }
    },
    {
      createKey: (args) => {
        return args[0]?.termPath ?? "";
      },
    },
  );

  pidToPath = (pid: number): string | undefined => {
    for (const termPath in this.sessions) {
      const s = this.sessions[termPath];
      if (s.pid == pid) {
        return s.options.path;
      }
    }
  };
}
