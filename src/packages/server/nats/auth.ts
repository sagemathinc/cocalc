/*
Points that took me a while to figure out:

- For each CoCalc user who is accessing CoCalc resources from a *browser*, on the fly, we create:

  - a signing key, which allows access to hub api's and running projects they are a collaborator on, etc., etc.

  - a NATS user that has *bearer* enabled and is associated to the above signing key, so they get all its permissions

  Then the JWT for the user is stored as a secure http cookie in the browser and grants the user permissions.
  TODO: worry about expiration

- There is no supported way to do user management except calling the nsc command line tool.  That's fine.


DOCS:
 - https://nats-io.github.io/nsc/

USAGE:

a = require('@cocalc/server/nats/auth'); await a.configureNatsUser({account_id:'275f1db7-bf37-4b44-b9aa-d64694269c9f'})
await a.configureNatsUser({project_id:'81e0c408-ac65-4114-bad5-5f4b6539bd0e'})
*/

import getPool from "@cocalc/database/pool";
import { isValidUUID } from "@cocalc/util/misc";
import getLogger from "@cocalc/backend/logger";
import nsc0 from "@cocalc/backend/nats/nsc";
import { natsAccountName } from "@cocalc/backend/nats/conf";
import { throttle } from "lodash";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

const logger = getLogger("server:nats:auth");

export async function nsc(
  args: string[],
  { noAccount }: { noAccount?: boolean } = {},
) {
  // console.log(`nsc ${args.join(" ")}`);
  return await nsc0(noAccount ? args : [...args, "-a", natsAccountName]);
}

// TODO: consider making the names shorter strings using https://www.npmjs.com/package/short-uuid

// A CoCalc User is (so far): a project or an account.
type CoCalcUser =
  | {
      account_id: string;
      project_id?: string;
    }
  | {
      account_id?: string;
      project_id: string;
    };

function getCoCalcUserType({
  account_id,
  project_id,
}: CoCalcUser): "account" | "project" {
  if (account_id) {
    if (project_id) {
      throw Error("exactly one of account_id or project_id must be specified");
    }
    return "account";
  }
  if (project_id) {
    return "project";
  }
  throw Error("account_id or project_id must be specified");
}

function getCoCalcUserId({ account_id, project_id }: CoCalcUser): string {
  if (account_id) {
    if (project_id) {
      throw Error("exactly one of account_id or project_id must be specified");
    }
    return account_id;
  }
  if (project_id) {
    return project_id;
  }
  throw Error("account_id or project_id must be specified");
}

function getNatsUserName({ account_id, project_id }: CoCalcUser) {
  if (account_id) {
    if (project_id) {
      throw Error("exactly one of account_id or project_id must be specified");
    }
    return `account-${account_id}`;
  }
  if (project_id) {
    return `project-${project_id}`;
  }
  throw Error("account_id or project_id must be specified");
}

export async function getNatsUserJwt(cocalcUser: CoCalcUser): Promise<string> {
  return (
    await nsc(["describe", "user", getNatsUserName(cocalcUser), "--raw"])
  ).stdout.trim();
}

export async function configureNatsUser(cocalcUser: CoCalcUser) {
  const name = getNatsUserName(cocalcUser);
  const userId = getCoCalcUserId(cocalcUser);
  if (!isValidUUID(userId)) {
    throw Error("must be a valid uuid");
  }
  const userType = getCoCalcUserType(cocalcUser);
  // TODO: jetstream permissions are WAY TO BROAD.
  const goalPub = new Set([
    "_INBOX.>", // so can use request/response
    `hub.${userType}.${userId}.>`, // can talk as *only this user* to the hub's api's
    "$JS.API.INFO",
  ]);
  const goalSub = new Set([
    "_INBOX.>", // so can user request/response
    //"$JS.API.>", // TODO! This needs to be restrained more, I think??! Don't know.
    "system.>", // access to READ the system info kv store.
  ]);

  if (userType == "account") {
    goalSub.add(`*.account-${userId}.>`);
    goalPub.add(`*.account-${userId}.>`);

    // microservices api
    goalSub.add(`$SRV.*.account-${userId}.>`);
    goalSub.add(`$SRV.*.account-${userId}`);
    goalSub.add(`$SRV.*`);
    goalPub.add(`$SRV.*`);

    // jetstream
    goalPub.add(`$JS.API.*.*.KV_account-${userId}`);
    goalPub.add(`$JS.API.*.*.KV_account-${userId}.>`);

    const pool = getPool();
    // all RUNNING projects with the user's group
    const query = `SELECT project_id, users#>>'{${userId},group}' AS group FROM projects WHERE state#>>'{state}'='running' AND users ? '${userId}' ORDER BY project_id`;
    const { rows } = await pool.query(query);
    for (const { project_id /*, group */ } of rows) {
      goalPub.add(`project.${project_id}.>`);
      goalSub.add(`project.${project_id}.>`);

      goalPub.add(`*.project-${project_id}.>`);
      goalSub.add(`*.project-${project_id}.>`);
      goalPub.add(`$JS.*.*.*.KV_project-${project_id}`);
      goalPub.add(`$JS.*.*.*.KV_project-${project_id}.>`);
      goalPub.add(`$JS.*.*.*.project-${project_id}-patches`);
      goalPub.add(`$JS.*.*.*.project-${project_id}-patches.>`);
      goalPub.add(`$JS.*.*.*.*.project-${project_id}-patches.>`);
    }
    // TODO: there will be other subjects
    // TODO: something similar for projects, e.g., they can publish to a channel that browser clients
    // will listen to, e.g., for timetravel editing.
  } else if (userType == "project") {
    // the project can publish to anything under its own subject:
    goalPub.add(`project.${userId}.>`);
    goalSub.add(`project.${userId}.>`);

    goalPub.add(`*.project-${userId}.>`);
    goalSub.add(`*.project-${userId}.>`);

    // microservices api
    goalSub.add(`$SRV.*.project-${userId}.>`);
    goalSub.add(`$SRV.*.project-${userId}`);
    goalSub.add(`$SRV.*`);
    goalPub.add(`$SRV.*`);

    // jetstream
    goalPub.add(`$JS.API.*.*.KV_project-${userId}`);
    goalPub.add(`$JS.API.*.*.KV_project-${userId}.>`);
  }

  // **Subject Permissions SYNC Algorithm **
  // figure out what signing key currently allows an update it to be exactly what is specified above.

  const currentSigningKey = await getScopedSigningKey(name);
  if (currentSigningKey == null) {
    throw Error(`no signing key '${name}'`);
  }
  const currentPub = new Set<string>(currentSigningKey["Pub Allow"] ?? []);
  const currentSub = new Set<string>(currentSigningKey["Sub Allow"] ?? []);
  const rm: string[] = [];
  const pub: string[] = [];
  const sub: string[] = [];
  for (const subject of goalPub) {
    if (!currentPub.has(subject)) {
      // need to add:
      pub.push(subject);
    }
  }
  for (const subject of currentPub) {
    if (!goalPub.has(subject)) {
      // need to remove
      rm.push(subject);
      // this removes from everything after it happens, so update currenSub state, just in case
      currentSub.delete(subject);
    }
  }
  for (const subject of goalSub) {
    if (!currentSub.has(subject)) {
      // need to add:
      sub.push(subject);
    }
  }
  for (const subject of currentSub) {
    if (!goalSub.has(subject)) {
      // need to remove
      rm.push(subject);
      // does this break a pub?  if so, account for this.
      if (goalPub.has(subject) && !pub.includes(subject)) {
        pub.push(subject);
      }
    }
  }
  const args = ["edit", "signing-key", "--sk", name];
  let changed = false;
  if (rm.length > 0) {
    // --rm applies to both pub and sub and happens after adding,
    // so we have to do it separately at the beginning in order to
    // handle some edge cases (that might never happen).
    logger.debug("configureNatsUser ", { rm });
    await nsc([...args, "--rm", rm.join(",")]);
    changed = true;
  }
  if (sub.length > 0 || pub.length > 0) {
    // TODO: I think there is --allow-pubsub which does both in one line,
    // which would shorten this slightly
    if (sub.length > 0) {
      args.push("--allow-sub");
      args.push(sub.join(","));
    }
    if (pub.length > 0) {
      args.push("--allow-pub");
      args.push(pub.join(","));
    }
    logger.debug("configureNatsUser ", { pub, sub });
    await nsc(args);
    changed = true;
  }
  if (changed) {
    pushToServer();
  }
}

export async function addProjectPermission({ account_id, project_id }) {
  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("user must be collaborator on project");
  }
  const name = getNatsUserName({ account_id });
  await nsc([
    "edit",
    "signing-key",
    "--sk",
    name,
    "--allow-sub",
    `project.${project_id}.>,*.project-${project_id}.>`,
    "--allow-pub",
    `project.${project_id}.>,*.project-${project_id}.>,$JS.*.*.*.KV_project-${project_id},$JS.*.*.*.KV_project-${project_id}.>,$JS.*.*.*.project-${project_id}-patches,$JS.*.*.*.project-${project_id}-patches.>,$JS.*.*.*.*.project-${project_id}-patches.>`,
  ]);
  await pushToServer();
}

export async function removeProjectPermission({ account_id, project_id }) {
  const name = getNatsUserName({ account_id });
  await nsc([
    "edit",
    "signing-key",
    "--sk",
    name,
    "--rm",
    `project.${project_id}.>,*.project-${project_id}.>,$JS.*.*.*.KV_project-${project_id},$JS.*.*.*.KV_project-${project_id}.>,$JS.*.*.*.KV_project-${project_id}-patches,$JS.*.*.*.KV_project-${project_id}-patches.>,$JS.*.*.*.*.project-${project_id}-patches.>`,
  ]);
  await pushToServer();
}

export async function getScopedSigningKey(
  natsUser: string,
): Promise<{ [key: string]: string[] } | null> {
  let { stdout } = await nsc(["describe", "user", natsUser]);
  // it seems impossible to get the scoped signing key params using --json; they just aren't there
  // i.e., it's not implemented. so we parse text output...
  const i = stdout.indexOf("Scoped");
  if (i == -1) {
    // there is no scoped signing key
    return null;
  }
  stdout = stdout.slice(i);
  const obj: { [key: string]: string[] } = {};
  let key = "";
  for (const line of stdout.split("\n")) {
    const v = line.split("|");
    if (v.length == 4) {
      const key2 = v[1].trim();
      const val = v[2].trim();
      if (!key2 && obj[key] != null) {
        // automatically account for arrays (for pub and sub)
        obj[key].push(val);
      } else {
        key = key2; // record this so can use for arrays.  Also, obj[key] is null since key2 is set.
        obj[key] = [val];
      }
    }
  }
  return obj;
}

// we push to server whenever there's a change, but at most once every few seconds,
// and if we push while a push is happening, it doesn't do it twice at once.
export const pushToServer = throttle(
  reuseInFlight(async () => {
    try {
      await nsc(["push"]);
    } catch (err) {
      // TODO: adminNotification?  This could be very serious.
      logger.debug("push configuration to nats server failed", err);
    }
  }),
  3000,
  { leading: true, trailing: true },
);

export async function createNatsUser(cocalcUser: CoCalcUser) {
  await nsc(["pull", "-A"], {
    noAccount: true,
  });
  const { stderr } = await nsc(["edit", "account", "--sk", "generate"], {
    noAccount: true,
  });
  const key = stderr.trim().split('"')[1];
  const name = getNatsUserName(cocalcUser);
  // bearer is critical so that the signing key can be used in the browser without
  // requiring the private key to also be in the client in the browser (which is
  // less secure since it easily leaks).
  await nsc(["edit", "signing-key", "--sk", key, "--role", name, "--bearer"]);
  await nsc(["add", "user", name, "--private-key", name]);
  await configureNatsUser(cocalcUser);
  pushToServer();
}

// export async function updateActiveCollaborators(project_id: string) {
//   const pool = getPool();
//   const { rows } = await pool.query(
//     "select account_id from accounts where account_id=any(select jsonb_object_keys(users)::uuid from projects where project_id=$1) and last_active >= now() - interval '1 day'",
//     [project_id],
//   );
// }

export async function getJwt(cocalcUser: CoCalcUser): Promise<string> {
  try {
    return await getNatsUserJwt(cocalcUser);
  } catch (_err) {
    await createNatsUser(cocalcUser);
    return await getNatsUserJwt(cocalcUser);
  }
}
