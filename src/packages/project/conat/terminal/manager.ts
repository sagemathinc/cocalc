import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { getLogger } from "@cocalc/project/logger";
import { createTerminalServer } from "@cocalc/conat/service/terminal";
import { project_id /*, compute_server_id */ } from "@cocalc/project/data";
import { isEqual } from "lodash";
import ensureContainingDirectoryExists from "@cocalc/backend/misc/ensure-containing-directory-exists";
import {
  openFiles as createOpenFiles,
  type OpenFiles,
} from "@cocalc/project/conat/sync";
import { Session } from "./session";

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
  private servers: { [path: string]: any } = {};
  private sessions: { [path: string]: Session } = {};
  private openFiles?: OpenFiles;

  constructor() {
    this.init();
  }

  init = async () => {
    this.openFiles = await createOpenFiles();
  };

  close = () => {
    this.openFiles?.close();
    delete this.openFiles;
    this.servers = {};
    this.sessions = {};
  };

  createTerminalService = reuseInFlight(
    async (path: string, opts?: CreateOptions) => {
      if (this.servers[path] != null) {
        return;
      }
      let options: any = undefined;
      console.log(new Date(), "createTerminalService", path, opts);
      const getSession = async (noCreate?: boolean) => {
        const cur = this.sessions[path];
        if (cur == null) {
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
        }
        return cur;
      };
      const impl = {
        create: async (
          opts: CreateOptions,
        ): Promise<{ success: "ok"; note?: string; ephemeral?: boolean }> => {
          console.log(new Date(), "terminal.create", path, opts);
          // save options to reuse.
          options = opts;
          const note = await this.createTerminal({ ...opts, path });
          console.log(path, new Date(), "done!", note);
          return { success: "ok", note };
        },

        write: async (data: string): Promise<void> => {
          if (typeof data != "string") {
            throw Error(`data must be a string -- ${JSON.stringify(data)}`);
          }
          const session = await getSession();
          await session.write(data);
        },

        restart: async () => {
          const session = await getSession();
          await session.restart();
        },

        cwd: async () => {
          const session = await getSession();
          return await session.getCwd();
        },

        kill: async () => {
          try {
            const session = await getSession(true);
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
          const session = await getSession();
          session.setSize(opts);
        },

        close: async (browser_id: string) => {
          this.sessions[path]?.browserLeaving(browser_id);
        },
      };

      const server = await createTerminalServer({ path, project_id, impl });
      server.on("close", () => {
        this.sessions[path]?.close();
        delete this.sessions[path];
        delete this.servers[path];
      });
      this.servers[path] = server;
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
