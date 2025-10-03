export type LocalPathFunction = (opts: {
  project_id: string;
  // disk quota to set on the path (in bytes)
  disk?: number;
  // if set, create scratch space of this size in bytes and return path
  // to it as scratch.
  scratch?: number;
}) => Promise<{ home: string; scratch?: string }>;

export interface SshServer {
  name: string;
  host: string;
  port: number;
  user: string;
}

export type SshServersFunction = (opts: {
  project_id: string;
}) => Promise<SshServer[]>;

export interface Configuration {
  // optional Docker image
  image?: string;
  // shared secret between project and hubs to enhance security (via defense in depth)
  secret?: string;
  // extra variables that get merged into the environment of the project.
  env?: { [key: string]: string };
  // cpu priority: 1, 2 or 3, with 3 being highest
  cpu?: number;
  // memory limit in BYTES
  memory?: number;
  // swap -- enabled or not.  The actual amount is a function of
  // memory (above), RAM, and swap configuration on the runner itself -- see backend/podman/memory.ts
  swap?: boolean;
  // pid limit
  pids?: number;
  // disk size in bytes
  disk?: number;
  // if given, a /scratch is mounted in the container of this size in bytes
  scratch?: number;
}
