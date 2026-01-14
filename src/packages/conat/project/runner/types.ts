export type LocalPathFunction = (opts: {
  project_id: string;
  // disk quota to set on the path (in bytes)
  disk?: number;
  // if set, create scratch space of this size in bytes and return path
  // to it as scratch.
  scratch?: number;
  // if false, only resolve paths without creating volumes
  ensure?: boolean;
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
  // SSH public key used by sshpiperd to reach the project container.
  ssh_proxy_public_key?: string;
  // shared secret between project and hubs to enhance security (via defense in depth)
  secret?: string;
  // Concatenated SSH public keys (from master) to be injected into the
  // project's managed authorized_keys file; combined with user-managed
  // ~/.ssh/authorized_keys at auth time.
  authorized_keys?: string;
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
  // if given create tmpfs ramdisk using this many bytes; if not given,
  // but scratch is given, then /tmp is /scratch/tmp; if neither is
  // given then tmp is part of the rootfs and is backed up (so NOT good).
  tmp?: number;
  // if true, allow GPU devices to be passed through (via CDI)
  gpu?: boolean;
  // backup restore behavior when starting a project on a host
  restore?: "none" | "auto" | "required";
  // LRO op_id to publish progress for project start.
  lro_op_id?: string;
}
