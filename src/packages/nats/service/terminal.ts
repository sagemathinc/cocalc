/*
Service for controlling a terminal served from a project/compute server.
*/

import { createServiceClient, createServiceHandler } from "./typed";

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

const service = "terminal";

export function createTerminalClient({ project_id, path }) {
  return createServiceClient<TerminalServiceApi>({ project_id, path, service });
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
  return await createServiceHandler<TerminalServiceApi>({
    project_id,
    path,
    service,
    description: "Terminal service.",
    impl,
  });
}

/*
import { delay } from "awaiting";
async function callWithRetry(f, maxTime) {
  let d = 100;
  const start = Date.now();
  while (Date.now() - start < maxTime) {
    try {
      return await f();
    } catch (err) {
      if (err.code == "503") {
        d = Math.min(3000, d * 1.3);
        if (Date.now() + d - start >= maxTime) {
          throw err;
        }
        await delay(d);
        continue;
      }
      throw err;
    }
  }
}
*/
