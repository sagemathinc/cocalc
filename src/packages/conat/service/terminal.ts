/*
Service for controlling a terminal served from a project/compute server.
*/

import {
  createServiceClient,
  createServiceHandler,
  type ConatService,
} from "./typed";

export type { ConatService };

export const SIZE_TIMEOUT_MS = 45000;

// API that runs under Node.js in linux:

interface TerminalApi {
  create: (opts: {
    env?: { [key: string]: string };
    command?: string;
    args?: string[];
    cwd?: string;
    ephemeral?: boolean;
  }) => Promise<{ success: "ok"; note?: string; ephemeral?: boolean }>;

  write: (data: string) => Promise<void>;

  restart: () => Promise<void>;

  cwd: () => Promise<string | undefined>;

  kill: () => Promise<void>;

  size: (opts: {
    rows: number;
    cols: number;
    browser_id: string;
    kick?: boolean;
  }) => Promise<void>;

  // sent from browser to project when this client is leaving.
  close: (browser_id: string) => Promise<void>;
}

export function createTerminalClient({
  project_id,
  termPath,
}) {
  return createServiceClient<TerminalApi>({
    project_id,
    path: termPath,
    service: "terminal-server",
    timeout: 3000,
  });
}

export type TerminalServiceApi = ReturnType<typeof createTerminalClient>;

export function createTerminalServer({
  project_id,
  termPath,
  impl,
}: {
  project_id: string;
  termPath: string;
  impl;
}): ConatService {
  return createServiceHandler<TerminalApi>({
    project_id,
    path: termPath,
    service: "terminal-server",
    description: "Terminal service.",
    impl,
  });
}

// API that runs in the browser:

export interface TerminalBrowserApi {
  // command is used for things like "open foo.txt" in the terminal.
  command: (mesg) => Promise<void>;

  // used for kicking all but the specified user out:
  kick: (sender_browser_id: string) => Promise<void>;

  // tell browser to change its size
  size: (opts: { rows: number; cols: number }) => Promise<void>;
}

export function createBrowserClient({ project_id, termPath }) {
  return createServiceClient<TerminalBrowserApi>({
    project_id,
    path: termPath,
    service: "terminal-browser",
  });
}

export function createBrowserService({
  project_id,
  termPath,
  impl,
}: {
  project_id: string;
  termPath: string;
  impl: TerminalBrowserApi;
}): ConatService {
  return createServiceHandler<TerminalBrowserApi>({
    project_id,
    path: termPath,
    service: "terminal-browser",
    description: "Browser Terminal service.",
    all: true,
    impl,
  });
}
