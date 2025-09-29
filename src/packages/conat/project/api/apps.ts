import type { NamedServerName } from "@cocalc/util/types/servers";

export const apps = {
  start: true,
  stop: true,
  status: true,
};

export interface Apps {
  start: (name: NamedServerName) => Promise<{
    state: "running" | "stopped";
    port: number;
    url: string;
    pid?: number;
    stdout: Buffer;
    stderr: Buffer;
    spawnError?;
    exit?: { code; signal? };
  }>;

  status: (name: NamedServerName) => Promise<
    | {
        state: "running" | "stopped";
        port: number;
        url: string;
        pid?: number;
        stdout: Buffer;
        stderr: Buffer;
        spawnError?;
        exit?: { code; signal? };
      }
    | { state: "stopped" }
  >;

  stop: (name: NamedServerName) => Promise<void>;
}
