/*
NATS service that provides tiered storage of data.

This is pure javascript and sets the basic interface,
behavior and types for both client and server.

See also @cocalc/server/nats/tiered-storage.
*/

import { getEnv, getLogger } from "@cocalc/nats/client";
import { type Subscription, Empty } from "@nats-io/nats-core";
import { isValidUUID } from "@cocalc/util/misc";

const logger = getLogger("tiered-storage:server");

export type State = "archived" | "restoring" | "ready";

export interface Stats {
  bytes: number;
}

export interface User0 {
  user_id: string;
  type: "project" | "account";
}
type User = User0 | { type: "hub" };

export const SUBJECT = "tiered-storage";

export interface TieredStorage {
  state: (user: User) => Promise<State>;
  restore: (user: User) => Promise<Stats>;
  archive: (user: User) => Promise<Stats>;
}

export function tieredStorageSubject(user: User) {
  if (account_id) {
    return `${SUBJECT}.account-${account_id}.api`;
  } else if (project_id) {
    return `${SUBJECT}.project-${project_id}.api`;
  } else {
    return `${SUBJECT}.hub.api`;
  }
}

function getUser(subject: string): User {
  if (subject.startsWith(`${SUBJECT}.account-`)) {
    return {
      user_id: subject.slice(
        `${SUBJECT}.account-`.length,
        `${SUBJECT}.account-`.length + 36,
      ),
      type: "account",
    };
  }
  if (subject.startsWith(`${SUBJECT}.project-`)) {
    return {
      user_id: subject.slice(
        `${SUBJECT}.project-`.length,
        `${SUBJECT}.project-`.length + 36,
      ),
      type: "project",
    };
  }

  return { type: "hub" };
}

let terminated = false;
export async function terminate() {
  if (terminated) {
    return;
  }
  terminated = true;
}

async function mainLoop() {
  while (!terminated) {
    try {
      await init();
    } catch (err) {
      logger.debug("");
    }
  }
}

let sub: Subscription | null = null;
export async function run(tieredStorage: TieredStorage) {
  const { nc } = await getEnv();
  sub = nc.subscribe(`${SUBJECT}.*.api`, { queue: "0" });
  await listen(sub, tieredStorage);
}

async function listen(sub, tieredStorage: TieredStorage) {
  for await (const mesg of sub) {
    handleMessage(mesg, tieredStorage);
  }
}

async function handleMessage(mesg, tieredStorage: TieredStorage) {
  let resp;

  try {
    const { jc } = await getEnv();
    const user = getUser(mesg.subject);
    const command = jc.decode(mesg.data);
    if (command == "state") {
      resp = await tieredStorage.state(user);
    } else if (command == "restore") {
      resp = await tieredStorage.restore(user);
    } else if (command == "archive") {
      resp = await tieredStorage.archive(user);
    } else {
      throw Error(`unknown command '${command}'`);
    }
  } catch (err) {
    resp = { error: `${err}` };
  }
  mesg.respond(jc.encode(resp));
}
