import type {
  ExecuteCodeOutput,
  ExecuteCodeOptions,
} from "@cocalc/util/types/execute-code";

export const system = {
  ping: true,
  terminate: true,
  exec: true,
  realpath: true,
};

export interface System {
  ping: () => Promise<{ now: number }>;
  terminate: () => Promise<void>;
  exec: (opts: ExecuteCodeOptions) => Promise<ExecuteCodeOutput>;
  realpath: (path: string) => Promise<string>;
}
