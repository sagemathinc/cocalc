import { get, set, touch } from "./db";
import { exec } from "./util";
import { projectDataset, projectMountpoint } from "./names";
import { context } from "./config";

// Ensure that this project is mounted and setup so that export to the
// given client is allowed. 
// Returns the remote that the client should use for NFS mounting, i.e.,
// this return s, then type "mount s /mnt/{project_id}" to mount the filesystem.
// If client is not given, just sets the share at NFS level
// to what's specified in the database.
export async function shareNFS({
  client,
  project_id,
  namespace = context.namespace,
}: {
  client?: string;
  project_id: string;
  namespace?: string;
}): Promise<string> {
  client = client?.trim();
  const { pool, nfs } = get({ namespace, project_id });
  let hostname;
  if (client) {
    hostname = await hostnameFor(client);
    if (!nfs.includes(client)) {
      nfs.push(client);
      // update database which tracks what the share should be.
      set({ namespace, project_id, nfs: ({ nfs }) => [...nfs, client] });
    }
  }
  // actually ensure share is configured.
  const name = projectDataset({ pool, namespace, project_id });
  const sharenfs =
    nfs.length > 0
      ? `${nfs.map((client) => `rw=${client}`).join(",")},no_root_squash,crossmnt,no_subtree_check`
      : "off";
  await exec({
    verbose: true,
    command: "sudo",
    args: ["zfs", "set", `sharenfs=${sharenfs}`, name],
  });
  if (nfs.length > 0) {
    touch({ namespace, project_id });
  }
  if (client) {
    return `${hostname}:${projectMountpoint({ namespace, project_id })}`;
  } else {
    // no exports configured
    return "";
  }
}

// remove given client from nfs sharing
export async function unshareNFS({
  client,
  project_id,
  namespace = context.namespace,
}: {
  client: string;
  project_id: string;
  namespace?: string;
}) {
  let { nfs } = get({ namespace, project_id });
  if (!nfs.includes(client)) {
    // nothing to do
    return;
  }
  nfs = nfs.filter((x) => x != client);
  // update database which tracks what the share should be.
  set({ namespace, project_id, nfs });
  // update zfs/nfs
  await shareNFS({ project_id, namespace });
}

let serverIps: null | string[] = null;
async function hostnameFor(client: string) {
  if (serverIps == null) {
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const { stdout } = await exec({
      verbose: false,
      command: "ifconfig",
    });
    let i = stdout.indexOf("inet ");
    const v: string[] = [];
    while (i != -1) {
      let j = stdout.indexOf("\n", i);
      if (j == -1) {
        break;
      }
      const x = stdout.slice(i, j).split(" ");
      const ip = x[1];
      if (ipRegex.test(ip)) {
        v.push(ip);
      }
      i = stdout.indexOf("inet ", j);
    }
    if (v.length == 0) {
      throw Error("unable to determine server ip address");
    }
    serverIps = v;
  }
  for (const ip of serverIps) {
    if (subnetMatch(ip, client)) {
      return ip;
    }
  }
  throw Error("found no matching subdomain");
}

// a and b are ip addresses.  Return true
// if the are on the same subnet, by which
// we mean that the first *TWO* segments match,
// since that's the size of our subnets usually.
// TODO: make configurable (?).
function subnetMatch(a, b) {
  const v = a.split(".");
  const w = b.split(".");
  return v[0] == w[0] && v[1] == w[1];
}
