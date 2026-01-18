export const apps = {
  start: true,
  stop: true,
  status: true,
  waitForState: true,
};

export interface Apps {
  start: (name: string) => Promise<{
    state: "running" | "stopped";
    port: number;
    url: string;
    ready?: boolean;
    pid?: number;
    stdout: Buffer;
    stderr: Buffer;
    spawnError?;
    exit?: { code; signal? };
  }>;

  status: (name: string) => Promise<
    | {
        state: "running" | "stopped";
        port: number;
        url: string;
        ready?: boolean;
        pid?: number;
        stdout: Buffer;
        stderr: Buffer;
        spawnError?;
        exit?: { code; signal? };
      }
    | { state: "stopped" }
  >;

  waitForState: (
    name: string,
    state: "running" | "stopped",
    opts?: { timeout?: number; interval?: number },
  ) => Promise<boolean>;

  stop: (name: string) => Promise<void>;
}
