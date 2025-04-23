/*
NATS service that provides tiered storage of data.

This is pure javascript and sets the basic interface,
behavior and types for both client and server.

See also @cocalc/server/nats/tiered-storage.
*/

import { getEnv, getLogger } from "@cocalc/nats/client";
import { type Subscription, Empty } from "@nats-io/nats-core";
import { isValidUUID } from "@cocalc/util/misc";
import { type Location } from "@cocalc/nats/types";
import { delay } from "awaiting";

const logger = getLogger("tiered-storage:server");

export type State = "archived" | "restoring" | "ready";

export interface Info {
  bytes: number;
  location: Location;
}

export const SUBJECT = "tiered-storage";

export interface TieredStorage {
  state: (location: Location) => Promise<State>;
  info: (location: Location) => Promise<Info>;
  restore: (location: Location) => Promise<void>;
  archive: (location: Location) => Promise<void>;
  backup: (location: Location) => Promise<void>;

  // shut it down
  close: () => Promise<void>;
}

export type Command = "state" | "restore" | "archive" | "backup" | "info";

export function tieredStorageSubject({ account_id, project_id }: Location) {
  if (account_id) {
    if (project_id) {
      throw Error(
        "location for tiered storage must specify exactly one of account_id or project_id, but it specifies both",
      );
    }
    return `${SUBJECT}.account-${account_id}.api`;
  } else if (project_id) {
    return `${SUBJECT}.project-${project_id}.api`;
  } else {
    throw Error(
      "location for tiered storage must specify exactly one of account_id or project_id, but it specifies neither",
    );
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

let tieredStorage: TieredStorage | null = null;
export function init(ts: TieredStorage) {
  if (ts != null) {
    throw Error("tiered-storage: init already called");
  }
  tieredStorage = ts;
  mainLoop();
}

let terminated = false;
export async function terminate() {
  if (terminated) {
    return;
  }
  terminated = true;
  if (tieredStorage) {
    tieredStorage.close();
  }
  tieredStorage = null;
}

async function mainLoop() {
  while (!terminated) {
    try {
      await run();
    } catch (err) {
      logger.debug(`WARNING: run error (will restart) -- ${err}`);
      await delay(5000);
    }
  }
}

let sub: Subscription | null = null;
export async function run() {
  const { nc } = await getEnv();
  sub = nc.subscribe(`${SUBJECT}.*.api`, { queue: "0" });
  await listen(sub);
}

async function listen(sub) {
  for await (const mesg of sub) {
    if (tieredStorage == null) {
      throw Error("tiered storage not available");
    }
    handleMessage(mesg);
  }
}

async function handleMessage(mesg) {
  let resp;

  try {
    const { jc } = await getEnv();
    if (tieredStorage == null) {
      throw Error("tiered storage not available");
    }
    const user = getUser(mesg.subject);
    const { command } = jc.decode(mesg.data);
    if (command == "state") {
      resp = await tieredStorage.state(user);
    } else if (command == "restore") {
      resp = await tieredStorage.restore(user);
    } else if (command == "archive") {
      resp = await tieredStorage.archive(user);
    } else if (command == "backup") {
      resp = await tieredStorage.backup(user);
    } else if (command == "info") {
      resp = await tieredStorage.info(user);
    } else {
      throw Error(`unknown command '${command}'`);
    }
  } catch (err) {
    resp = { error: `${err}` };
  }
  mesg.respond(jc.encode(resp));
}
