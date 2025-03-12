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

$ node

a = require('@cocalc/server/nats/auth'); await a.configureNatsUser({account_id:'6aae57c6-08f1-4bb5-848b-3ceb53e61ede'})
await a.configureNatsUser({project_id:'00847397-d6a8-4cb0-96a8-6ef64ac3e6cf'})
*/

import getPool from "@cocalc/database/pool";
import { isValidUUID } from "@cocalc/util/misc";
import getLogger from "@cocalc/backend/logger";
import nsc0 from "@cocalc/backend/nats/nsc";
import { natsAccountName } from "@cocalc/backend/nats/conf";
import { throttle } from "lodash";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import { inboxPrefix } from "@cocalc/nats/names";

const logger = getLogger("server:nats:auth");

export async function nsc(
  args: string[],
  { noAccount }: { noAccount?: boolean } = {},
) {
  // console.log(`nsc ${args.join(" ")}`);
  return await nsc0(noAccount ? args : [...args, "-a", natsAccountName]);
}

// TODO: consider making the names shorter strings using https://www.npmjs.com/package/short-uuid

// A CoCalc User is (so far): a project or account or a hub (not covered here).
export type CoCalcUser =
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
    `hub.${userType}.${userId}.>`, // can talk as *only this user* to the hub's api's
    "$JS.API.INFO",
    // everyone can publish to all inboxes.  This seems like a major security risk, but with
    // request/reply, the reply subject under _inbox is a long random code that is only known
    // for a moment by the sender and the service, so I think it is NOT a security risk.
    "_INBOX.>",
  ]);
  const goalSub = new Set([
    inboxPrefix(cocalcUser) + ".>",
    "public.>", // access to READ the public system info kv store.
  ]);

  // the public jetstream: this makes it available *read only* to all accounts and projects.
  goalPub.add("$JS.API.*.*.public");
  goalPub.add("$JS.API.*.*.public.>");
  goalPub.add("$JS.API.CONSUMER.MSG.NEXT.public.>");

  // microservices info api -- TODO: security concerns!
  // Please don't tell me I have to name all microservice identically :-(
  goalSub.add(`$SRV.>`);
  goalPub.add(`$SRV.>`);
  // TODO/security: just doing the following is enough if we don't need to use the client
  // api to get stats/info about all services:
  // goalPub.add(`$SRV.*`);

  if (userType == "account") {
    goalSub.add(`*.account-${userId}.>`);
    goalPub.add(`*.account-${userId}.>`);

    // the account-specific kv stores
    goalPub.add(`$JS.*.*.*.KV_account-${userId}`);
    goalPub.add(`$JS.*.*.*.KV_account-${userId}.>`);

    // the account-specific stream:
    goalPub.add(`$JS.*.*.*.account-${userId}`);
    goalPub.add(`$JS.*.*.*.account-${userId}.>`);
    goalPub.add(`$JS.*.*.*.*.account-${userId}`);
    goalPub.add(`$JS.*.*.*.*.account-${userId}.>`);
    goalSub.add(`account.${userId}.>`);
    goalPub.add(`account.${userId}.>`);

    // this FC is needed for "flow control" - without this, you get random hangs forever at scale!
    goalPub.add(`$JS.FC.KV_account-${userId}.>`);

    const pool = getPool();
    // all RUNNING projects with the user's group
    const query = `SELECT project_id, users#>>'{${userId},group}' AS group FROM projects WHERE state#>>'{state}'='running' AND users ? '${userId}' ORDER BY project_id`;
    const { rows } = await pool.query(query);
    for (const { project_id } of rows) {
      const { pub, sub } = projectSubjects(project_id);
      add(goalSub, sub);
      add(goalPub, pub);
    }
  } else if (userType == "project") {
    const { pub, sub } = projectSubjects(userId);
    add(goalSub, sub);
    add(goalPub, pub);
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
  // We edit the signing key rather than the user, so the cookie in the user's
  // browser stays small and never has to change.

  // There is an option --allow-pub-response explained at
  // https://docs.nats.io/running-a-nats-service/configuration/securing_nats/authorization#allow-responses-map
  // which is supposed to makes it so we don't have to allow any user to publish to
  // all of _INBOX.>, which might be bad, since one user could in theory
  // publish a response to a different user's request (though in practice
  // the subject is random so not feasible).  Defense in depth.
  // It doesn't work in general though, e.g., when trying to get info about services.

  const args = [
    "edit",
    "signing-key",
    "--sk",
    name /*, "--allow-pub-response" */,
  ];

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
  const { pub, sub } = projectSubjects(project_id);
  await nsc([
    "edit",
    "signing-key",
    "--sk",
    name,
    "--allow-sub",
    Array.from(sub).join(","),
    "--allow-pub",
    Array.from(pub).join(","),
  ]);
  await pushToServer();
}

export async function removeProjectPermission({ account_id, project_id }) {
  const name = getNatsUserName({ account_id });
  const { pub, sub } = projectSubjects(project_id);
  add(pub, sub);
  await nsc([
    "edit",
    "signing-key",
    "--sk",
    name,
    "--rm",
    Array.from(pub).join(","),
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

export async function getJwt(cocalcUser: CoCalcUser): Promise<string> {
  try {
    return await getNatsUserJwt(cocalcUser);
  } catch (_err) {
    await createNatsUser(cocalcUser);
    return await getNatsUserJwt(cocalcUser);
  }
}

function projectSubjects(project_id: string) {
  const pub = new Set<string>([]);
  const sub = new Set<string>([]);
  pub.add(`project.${project_id}.>`);
  sub.add(`project.${project_id}.>`);

  pub.add(`*.project-${project_id}.>`);
  sub.add(`*.project-${project_id}.>`);

  // The unique project-wide jetstream key:value store
  pub.add(`$JS.*.*.*.KV_project-${project_id}`);
  pub.add(`$JS.*.*.*.KV_project-${project_id}.>`);
  // this FC is needed for "flow control" - without this, you get random hangs forever at scale!
  pub.add(`$JS.FC.KV_project-${project_id}.>`);

  // The unique project-wide jetstream stream:
  pub.add(`$JS.*.*.*.project-${project_id}`);
  pub.add(`$JS.*.*.*.project-${project_id}.>`);
  pub.add(`$JS.*.*.*.*.project-${project_id}.>`);
  return { pub, sub };
}

function add(X: Set<string>, Y: Set<string>) {
  for (const y of Y) {
    X.add(y);
  }
}
