/*
Service for controlling a terminal served from a project/compute server.
*/

import { callNatsService, createNatsService } from "./service";
import { delay } from "awaiting";

export interface TerminalServiceApi {
  create: (opts: {
    env?: { [key: string]: string };
    command?: string;
    args?: string[];
    cwd?: string;
  }) => Promise<{ success: "ok"; note?: string }>;

  write: (data: string) => Promise<void>;

  restart: () => Promise<void>;

  cwd: () => Promise<string | undefined>;

  kill: () => Promise<void>;

  size: (opts: { rows: number; cols: number; client: string }) => Promise<void>;

  boot: (opts: { client: string }) => Promise<void>;
}

const names = ["create", "write", "restart", "cwd", "kill", "size", "boot"];

const service = "terminal";

export function createTerminalClient({ project_id, path }) {
  const C: Partial<TerminalServiceApi> = {};
  for (const name of names) {
    C[name] = async (...args) => {
      const f = async () =>
        await callNatsService({
          project_id,
          path,
          service,
          mesg: { name, args },
        });

      let d = 100;
      const start = Date.now();
      while (Date.now() - start < 15000) {
        try {
          return await f();
        } catch (err) {
          if (err.code == "503") {
            d = Math.min(3000, d * 1.3);
            await delay(d);
            continue;
          }
          throw err;
        }
      }
    };
  }
  return C as TerminalServiceApi;
}

export async function createTerminalServer({
  project_id,
  path,
  impl,
}: {
  project_id: string;
  path: string;
  impl: TerminalServiceApi;
}) {
  return await createNatsService({
    project_id,
    path,
    service,
    handler: async (mesg) => await impl[mesg.name](...mesg.args),
  });
}
