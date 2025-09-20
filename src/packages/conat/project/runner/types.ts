export type LocalPathFunction = (opts: {
  project_id: string;
}) => Promise<string>;

// Sync is exactly what mutagen takes.  Use the variable
// COCALC_FILE_SERVER defined above to refer to the remote server
// that you are syncing with.
export interface Sync {
  alpha: string;
  beta: string;
  flags?: string[];
}

// Forward is exactly what mutagen takes
export interface Forward {
  source: string;
  destination: string;
  flags?: string[];
}

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
  // cpu limit: sames as k8s format
  cpu?: number | string;
  // memory limit: sames as k8s format
  memory?: number | string;
  // swap limit
  swap?: number | string;
  // pid limit
  pids?: number | string;
  // disk size
  disk?: number | string;
  // filesystem paths that are sync'd on disk to a remote fileserver (etc)
  sync?: Sync[];
  // network ports that are forwarded
  forward?: Forward[];
}
