export const apps = {
  start: true,
  stop: true,
  status: true,
};

export interface Apps {
  start: (name: string) => Promise<{
    state: "running" | "stopped";
    port: number;
    url: string;
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
        pid?: number;
        stdout: Buffer;
        stderr: Buffer;
        spawnError?;
        exit?: { code; signal? };
      }
    | { state: "stopped" }
  >;

  stop: (name: string) => Promise<void>;
}
