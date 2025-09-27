import type {
  ExecuteCodeOutput,
  ExecuteCodeOptions,
} from "@cocalc/util/types/execute-code";
import type { DirectoryListingEntry } from "@cocalc/util/types";
import type {
  Configuration,
  ConfigurationAspect,
} from "@cocalc/comm/project-configuration";
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

  // named servers like jupyterlab, vscode, etc.
  startNamedServer: true,
  statusOfNamedServer: true,

  // ssh support
  sshPublicKey: true,
  updateSshKeys: true,
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

  startNamedServer: (
    name: NamedServerName,
  ) => Promise<{ port: number; url: string }>;
  statusOfNamedServer: (
    name: NamedServerName,
  ) => Promise<
    { state: "running"; port: number; url: string } | { state: "stopped" }
  >;

  // return the ssh public key of this project/compute server.
  // The project generates a public key on startup that is used
  // internally for connecting to the file server, and this is that key.
  // Basically this is a key that is used internally for communication
  // within cocalc, so other services can trust the project.
  // It can be changed without significant consequences (the file-server
  // container gets restarted).
  sshPublicKey: () => Promise<string>;

  // calling updateSshKeys causes the project to ensure that
  // ~/.ssh/authorized_keys contains all entries set
  // in the database (in addition to whatever else might be there).
  updateSshKeys: () => Promise<void>;
}
