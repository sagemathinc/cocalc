import { join } from "path";

export const INTERNAL_SSH_CONFIG = ".ssh/.cocalc";

export const SSH_IDENTITY_FILE = join(INTERNAL_SSH_CONFIG, "id_ed25519");

export const FILE_SERVER_NAME = "file-server";

export const SSHD_CONFIG = join(INTERNAL_SSH_CONFIG, "sshd");

export const START_PROJECT_SSH = join(SSHD_CONFIG, "start-project-ssh.sh");

export interface Ports {
  "file-server": number;
  project: number;
  proxy: number;
  web: number;
}

export const PORTS = {
  // file-server = openssh sshd server running on same VM as
  // file-server for close access to files.  Runs
  // in a locked down container.
  "file-server": 2222,
  // dropbear lightweight ssh server running in the project container
  // directly, which users can ssh with full port forwarding and exactly
  // standard ssh sematics (.ssh/authorized_keys|config|etc.), but
  // runs in any container image. Forwarded to this container by mutagen
  // (so reverse ssh).
  project: 2223,
  // very simple http proxy written in nodejs running in the project, which
  // lets us proxy any webserver that supports base_url (e.g., juputerlab)
  // or non-absolute URL's (e.g., vscode).  This supports the same schema
  // as in cocalc, so the base_url has to be of the form
  //      /{PROJECT_ID}/server/{PORT}/ or /{PROJECT_ID}/port/{PORT}/
  proxy: 2224,
  // an arbitrary user-defined webserver, which will work without any base_url
  // or other requirement.  Served on wildcard subdomain.
  web: 2225,
} as Ports;
