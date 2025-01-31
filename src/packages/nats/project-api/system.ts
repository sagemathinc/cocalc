import type {
  ExecuteCodeOutput,
  ExecuteCodeOptions,
} from "@cocalc/util/types/execute-code";
import type { DirectoryListingEntry } from "@cocalc/util/types";
import type {
  Configuration,
  ConfigurationAspect,
} from "@cocalc/comm/project-configuration";

export const system = {
  terminate: true,

  version: true,

  listing: true,
  deleteFiles: true,
  moveFiles: true,
  renameFile: true,
  realpath: true,
  canonicalPaths: true,

  configuration: true,

  ping: true,
  exec: true,
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
  realpath: (path: string) => Promise<string>;
  canonicalPaths: (paths: string[]) => Promise<string[]>;

  configuration: (
    aspect: ConfigurationAspect,
    no_cache?,
  ) => Promise<Configuration>;

  ping: () => Promise<{ now: number }>;

  exec: (opts: ExecuteCodeOptions) => Promise<ExecuteCodeOutput>;

}
