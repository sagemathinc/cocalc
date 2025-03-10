import { get, set, touch } from "./db";
import { exec } from "./util";
import { filesystemDataset, filesystemMountpoint } from "./names";
import { primaryKey, type PrimaryKey } from "./types";

// Ensure that this filesystem is mounted and setup so that export to the
// given client is allowed.
// Returns the remote that the client should use for NFS mounting, i.e.,
// this return s, then type "mount s /mnt/..." to mount the filesystem.
// If client is not given, just sets the share at NFS level
// to what's specified in the database.
export async function shareNFS({
  client,
  ...fs
}: PrimaryKey & { client?: string }): Promise<string> {
  client = client?.trim();
  const pk = primaryKey(fs);
  const { pool, nfs } = get(pk);
  let hostname;
  if (client) {
    hostname = await hostnameFor(client);
    if (!nfs.includes(client)) {
      nfs.push(client);
      // update database which tracks what the share should be.
      set({ ...pk, nfs: ({ nfs }) => [...nfs, client] });
    }
  }
  // actually ensure share is configured.
  const name = filesystemDataset({ pool, ...pk });
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
    touch(pk);
  }
  if (client) {
    return `${hostname}:${filesystemMountpoint(pk)}`;
  } else {
    return "";
  }
}

// remove given client from nfs sharing
export async function unshareNFS({
  client,
  ...fs
}: PrimaryKey & { client: string }) {
  const pk = primaryKey(fs);
  let { nfs } = get(pk);
  if (!nfs.includes(client)) {
    // nothing to do
    return;
  }
  nfs = nfs.filter((x) => x != client);
  // update database which tracks what the share should be.
  set({ ...pk, nfs });
  // update zfs/nfs to no longer share to this client
  await shareNFS(pk);
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
