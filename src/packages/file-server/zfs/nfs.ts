import { dbProject, getDb } from "./db";
import { executeCode } from "@cocalc/backend/execute-code";
import { projectDataset, projectMountpoint } from "./names";
import { context, touch } from "./index";

// Ensure that this project is mounted and setup so that export to the
// given client is allowed. Returns the remote address that the client
// should use for NFS mounting.
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
  const { pool, nfs } = dbProject({ namespace, project_id });
  let hostname;
  if (client) {
    hostname = await hostnameFor(client);
    if (!nfs.includes(client)) {
      nfs.push(client);
      // update database which tracks what the share should be.
      const db = getDb();
      db.prepare(
        "UPDATE projects SET nfs=? WHERE namespace=? AND project_id=?",
      ).run(nfs.join(","), namespace, project_id);
    }
  }
  // actually ensure share is configured.
  const name = projectDataset({ pool, namespace, project_id });
  const sharenfs =
    nfs.length > 0
      ? `${nfs.map((client) => `rw=${client}`).join(",")},no_root_squash,crossmnt,no_subtree_check`
      : "off";
  await executeCode({
    verbose: true,
    command: "sudo",
    args: ["zfs", "set", `sharenfs=${sharenfs}`, name],
  });
  if(nfs.length > 0) {
    touch({ namespace, project_id })
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
  let { nfs } = dbProject({ namespace, project_id });
  if (!nfs.includes(client)) {
    // nothing to do
    return;
  }
  nfs = nfs.filter((x) => x != client);
  // update database which tracks what the share should be.
  const db = getDb();
  db.prepare(
    "UPDATE projects SET nfs=? WHERE namespace=? AND project_id=?",
  ).run(nfs.join(","), namespace, project_id);
  await shareNFS({ project_id, namespace });
}

let serverIps: null | string[] = null;
async function hostnameFor(client: string) {
  if (serverIps == null) {
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const { stdout } = await executeCode({
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
