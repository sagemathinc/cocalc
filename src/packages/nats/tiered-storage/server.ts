/*
NATS service that provides tiered storage of data.

This is pure javascript and sets the basic interface,
behavior and types for both client and server.

See also @cocalc/server/nats/tiered-storage.
*/

import { getEnv, getLogger } from "@cocalc/nats/client";
import { type Subscription } from "@nats-io/nats-core";
import { isValidUUID } from "@cocalc/util/misc";
import { type Location } from "@cocalc/nats/types";
import { delay } from "awaiting";
import { type StreamInfo } from "@nats-io/jetstream";

const logger = getLogger("tiered-storage:server");

export type State = "archived" | "restoring" | "ready";

export interface Info {
  nats: { stream: null | StreamInfo; kv: null | StreamInfo };
  backup: { stream: null | StreamInfo; kv: null | StreamInfo };
  location: Location;
}

export const SUBJECT = "tiered-storage";

export interface TieredStorage {
  info: (location: Location) => Promise<Info>;
  restore: (location: Location) => Promise<void>;
  archive: (location: Location) => Promise<void>;
  backup: (location: Location) => Promise<void>;

  // shut it down
  close: () => Promise<void>;
}

export type Command = "restore" | "archive" | "backup" | "info";

export function tieredStorageSubject({ account_id, project_id }: Location) {
  if (account_id) {
    if (project_id) {
      throw Error(
        "location for tiered storage must specify exactly one of account_id or project_id, but it specifies both",
      );
    }
    if (!isValidUUID(account_id)) {
      throw Error("invalid account_id");
    }
    return `${SUBJECT}.account-${account_id}.api`;
  } else if (project_id) {
    if (!isValidUUID(project_id)) {
      throw Error("invalid project_id");
    }
    return `${SUBJECT}.project-${project_id}.api`;
  } else {
    throw Error(
      "location for tiered storage must specify exactly one of account_id or project_id, but it specifies neither",
    );
  }
}

function getLocation(subject: string): Location {
  if (subject.startsWith(`${SUBJECT}.account-`)) {
    return {
      account_id: subject.slice(
        `${SUBJECT}.account-`.length,
        `${SUBJECT}.account-`.length + 36,
      ),
    };
  }
  if (subject.startsWith(`${SUBJECT}.project-`)) {
    return {
      project_id: subject.slice(
        `${SUBJECT}.project-`.length,
        `${SUBJECT}.project-`.length + 36,
      ),
    };
  }
  throw Error(`invalid subject -- ${subject}`);
}

let tieredStorage: TieredStorage | null = null;
export function init(ts: TieredStorage) {
  logger.debug("init");
  if (tieredStorage != null) {
    throw Error("tiered-storage: init already called");
  }
  tieredStorage = ts;
  mainLoop();
}

let terminated = false;
export async function terminate() {
  logger.debug("terminate");
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
    logger.debug("mainLoop: running...");
    try {
      await run();
    } catch (err) {
      const DELAY = 5000;
      logger.debug(`WARNING: run error (will restart in ${DELAY}ms) -- ${err}`);
      await delay(DELAY);
    }
  }
}

let sub: Subscription | null = null;
export async function run() {
  const { nc } = await getEnv();
  const subject = `${SUBJECT}.*.api`;
  logger.debug(`run: listening on '${subject}'`);
  sub = nc.subscribe(subject, { queue: "0" });
  await listen(sub);
}

async function listen(sub) {
  logger.debug("listen");
  for await (const mesg of sub) {
    if (tieredStorage == null) {
      throw Error("tiered storage not available");
    }
    handleMessage(mesg);
  }
}

async function handleMessage(mesg) {
  let resp;
  const { jc } = await getEnv();
  const location = getLocation(mesg.subject);
  const { command } = jc.decode(mesg.data);

  try {
    if (tieredStorage == null) {
      throw Error("tiered storage not available");
    }
    logger.debug("handleMessage", { location, command });
    if (command == "restore") {
      resp = await tieredStorage.restore(location);
    } else if (command == "archive") {
      resp = await tieredStorage.archive(location);
    } else if (command == "backup") {
      resp = await tieredStorage.backup(location);
    } else if (command == "info") {
      resp = await tieredStorage.info(location);
    } else {
      throw Error(`unknown command '${command}'`);
    }
  } catch (err) {
    resp = { error: `${err}` };
  }
  logger.debug("handleMessage -- resp", { location, command, resp });
  mesg.respond(jc.encode(resp));
}
