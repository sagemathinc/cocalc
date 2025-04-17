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
  resetConnection: true,

  version: true,

  listing: true,
  deleteFiles: true,
  moveFiles: true,
  renameFile: true,
  realpath: true,
  canonicalPaths: true,

  writeTextFileToProject: true,
  readTextFileFromProject: true,

  configuration: true,

  ping: true,
  exec: true,

  signal: true,
};

export interface System {
  // stop the api service
  terminate: () => Promise<void>;

  // close the nats connection -- this is meant for development purposes
  // and closes the connection; the connection monitor should then reoopen it within
  // a few seconds.  This is, of course, likely to NOT return, since the
  // connection is broken for a bit.
  resetConnection: () => Promise<{ closed: boolean }>;

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

  writeTextFileToProject: (opts: {
    path: string;
    content: string;
  }) => Promise<void>;
  readTextFileFromProject: (opts: { path: string }) => Promise<string>;

  configuration: (
    aspect: ConfigurationAspect,
    no_cache?,
  ) => Promise<Configuration>;

  ping: () => Promise<{ now: number }>;

  exec: (opts: ExecuteCodeOptions) => Promise<ExecuteCodeOutput>;

  signal: (opts: {
    signal: number;
    pids?: number[];
    pid?: number;
  }) => Promise<void>;
}
