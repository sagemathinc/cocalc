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

export const system = {
  terminate: true,

  version: true,

  listing: true,
  deleteFiles: true,
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

  // jupyter kernel management
  listJupyterKernels: true,
  stopJupyterKernel: true,
};

export interface System {
  // stop the api service
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

  listJupyterKernels: () => Promise<
    { pid: number; connectionFile: string; kernel_name?: string }[]
  >;
  stopJupyterKernel: (opts: { pid: number }) => Promise<{ success: boolean }>;
}
