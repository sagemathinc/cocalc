/*
Service for controlling a terminal served from a project/compute server.
*/

import { createServiceClient, createServiceHandler } from "./typed";

export const SIZE_TIMEOUT_MS = 45000;

// API that runs under Node.js in linux:

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

  size: (opts: {
    rows: number;
    cols: number;
    browser_id: string;
  }) => Promise<void>;

  boot: (opts: { browser_id: string }) => Promise<void>;

  // send when this client is leaving.
  close: (browser_id: string) => Promise<void>;
}

export function createTerminalClient({ project_id, path }) {
  return createServiceClient<TerminalServiceApi>({
    project_id,
    path,
    service: "project-api",
  });
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
    service: "project-api",
    description: "Terminal service.",
    impl,
  });
}

// API that runs in the browser:

export interface TerminalBrowserApi {
  // command is used for things like "open foo.txt" in the terminal.
  command: (mesg) => Promise<void>;

  // used for kicking user out of the terminal
  kick: (opts: { browser_id: string }) => Promise<void>;

  // tell browser to change its size
  size: (opts: { rows: number; cols: number }) => Promise<void>;
}

export function createBrowserClient({ project_id, path }) {
  return createServiceClient<TerminalBrowserApi>({
    project_id,
    path,
    service: "browser-api",
  });
}

export async function createBrowserService({
  project_id,
  path,
  impl,
}: {
  project_id: string;
  path: string;
  impl: TerminalBrowserApi;
}) {
  return await createServiceHandler<TerminalBrowserApi>({
    project_id,
    path,
    service: "browser-api",
    description: "Browser Terminal service.",
    all: true,
    impl,
  });
}
