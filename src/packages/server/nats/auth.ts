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

import { executeCode } from "@cocalc/backend/execute-code";
import getPool from "@cocalc/database/pool";
import { isValidUUID } from "@cocalc/util/misc";
import getLogger from "@cocalc/backend/logger";
import { bin, ensureInstalled } from "@cocalc/backend/nats/install";
import { join } from "path";
import { throttle } from "lodash";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

// TODO: move this to server settings
const NATS_ACCOUNT = "cocalc";

const logger = getLogger("server:nats:auth");

export async function nsc(
  args: string[],
  { noAccount }: { noAccount?: boolean } = {},
) {
  await ensureInstalled(); // make sure (once) that nsc is installed
  // todo: for production we  have to put some authentication
  // options, e.g., taken from the database. Skip that for now.
  // console.log(`nsc ${args.join(" ")}`);
  return await executeCode({
    command: join(bin, "nsc"),
    args: noAccount ? args : [...args, "-a", NATS_ACCOUNT],
  });
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
  const goalPub = new Set(["_INBOX.>", `hub.${userType}.${userId}.>`]);
  const goalSub = new Set(["_INBOX.>"]);

  if (userType == "account") {
    goalSub.add(`$KV.account-${userId}.>`);

    const pool = getPool();
    // all RUNNING projects with the user's group
    const query = `SELECT project_id, users#>>'{${userId},group}' AS group FROM projects WHERE state#>>'{state}'='running' AND users ? '${userId}' ORDER BY project_id`;
    const { rows } = await pool.query(query);
    for (const { project_id /*, group */ } of rows) {
      // TODO - unsure -- do we need proven identity *in* project?
      //goalPub.add(`project.${project_id}.api.${group}.${userId}`);
      goalPub.add(`project.${project_id}.>`);
      goalSub.add(`project.${project_id}.>`);

      goalPub.add(`$KV.project-${project_id}.>`);
      goalSub.add(`$KV.project-${project_id}.>`);
    }
    // TODO: there will be other subjects
    // TODO: something similar for projects, e.g., they can publish to a channel that browser clients
    // will listen to, e.g., for timetravel editing.
  } else if (userType == "project") {
    // the project can publish to anything under its own subject:
    goalPub.add(`project.${userId}.>`);
    goalSub.add(`project.${userId}.>`);

    goalPub.add(`$KV.project-${userId}.>`);
    goalSub.add(`$KV.project-${userId}.>`);
  }
  // TEMPORARY: for learning jetstream!
  goalPub.add("$JS.>");
  goalSub.add("$JS.>");

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

export async function getScopedSigningKey(natsUser: string) {
  let { stdout } = await nsc(["describe", "user", natsUser]);
  // it seems impossible to get the scoped signing key params using --json; they just aren't there
  // i.e., it's not implemented. so we parse it.
  const i = stdout.indexOf("Scoped");
  if (i == -1) {
    // there is no scoped signing key
    return null;
  }
  stdout = stdout.slice(i);
  const obj: any = {};
  let key = "";
  for (const line of stdout.split("\n")) {
    const v = line.split("|");
    if (v.length == 4) {
      const key2 = v[1].trim();
      let val: string | string[] = v[2].trim();
      if (!key2 && obj[key] != null) {
        // automatically account for arrays (for pub and sub)
        if (typeof obj[key] == "string") {
          obj[key] = [obj[key], val];
        } else {
          obj[key].push(val);
        }
      } else {
        key = key2;
        if (key.startsWith("Pub ") || key.startsWith("Sub ")) {
          val = [val];
        }
        obj[key] = val;
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
