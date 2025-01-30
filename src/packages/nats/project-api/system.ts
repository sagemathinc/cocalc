import type {
  ExecuteCodeOutput,
  ExecuteCodeOptions,
} from "@cocalc/util/types/execute-code";
import type { DirectoryListingEntry } from "@cocalc/util/types";

export const system = {
  terminate: true,

  version: true,

  listing: true,
  deleteFiles: true,
  moveFiles: true,
  renameFile: true,

  ping: true,
  exec: true,
  realpath: true,
};

export interface System {
  terminate: () => Promise<void>;

  version: () => Promise<number>;

  listing: (opts: {
    path: string;
    hidden?: boolean;
  }) => Promise<DirectoryListingEntry[]>;
  deleteFiles: (opts: { paths: string[] }) => Promise<void>;
  moveFiles: (opts: { paths: string[]; dest: string }) => Promise<void>;
  renameFile: (opts: { src: string; dest: string }) => Promise<void>;

  ping: () => Promise<{ now: number }>;

  exec: (opts: ExecuteCodeOptions) => Promise<ExecuteCodeOutput>;

  realpath: (path: string) => Promise<string>;
}
