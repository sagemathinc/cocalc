import type {
  ExecuteCodeOutput,
  ExecuteCodeOptions,
} from "@cocalc/util/types/execute-code";
import type { DirectoryListingEntry } from "@cocalc/util/types";
import type {
  Configuration,
  ConfigurationAspect,
} from "@cocalc/comm/project-configuration";
import { type ProjectJupyterApiOptions } from "@cocalc/util/jupyter/api-types";
import type { NamedServerName } from "@cocalc/util/types/servers";

export const system = {
  terminate: true,

  version: true,

  listing: true,
  moveFiles: true,
  renameFile: true,
  realpath: true,
  canonicalPaths: true,

  // these should be deprecated -- the new streaming writeFile and readFile in conat/files are  better.
  writeTextFileToProject: true,
  readTextFileFromProject: true,

  configuration: true,

  ping: true,
  exec: true,

  signal: true,

  // jupyter stateless API
  jupyterExecute: true,

  // named servers like jupyterlab, vscode, etc.
  startNamedServer: true,
  statusOfNamedServer: true,
};

export interface System {
  // stop the api service
  terminate: () => Promise<void>;

  version: () => Promise<number>;

  listing: (opts: {
    path: string;
    hidden?: boolean;
  }) => Promise<DirectoryListingEntry[]>;
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

  jupyterExecute: (opts: ProjectJupyterApiOptions) => Promise<object[]>;

  startNamedServer: (
    name: NamedServerName,
  ) => Promise<{ port: number; url: string }>;
  statusOfNamedServer: (
    name: NamedServerName,
  ) => Promise<
    { state: "running"; port: number; url: string } | { state: "stopped" }
  >;
}
