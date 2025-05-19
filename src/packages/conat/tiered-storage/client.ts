/*
Client for the tiered server.
*/

import type { Info, Command } from "./server";
import { tieredStorageSubject } from "./server";
import { getEnv, getLogger } from "@cocalc/conat/client";
import { type Location } from "@cocalc/conat/types";
import { waitUntilConnected } from "@cocalc/conat/util";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { delay } from "awaiting";

const logger = getLogger("tiered-storage:client");

const TIMEOUT = {
  restore: 90 * 1000,
  backup: 90 * 1000,
  archive: 90 * 1000,
  info: 15 * 1000,
};

// Server will never ever archive anything that was active
// in less than this time, no matter what.   Usually, it's much longer.
// This is what clients get to assume to reduce load.
export const MIN_ARCHIVE_TIME = 6 * 60 * 1000 * 60; // 6 hours

const readyUntilAtLeast: { [location: string]: number } = {};

function toTime(s): number {
  if (s == null) {
    return 0;
  }
  return new Date(s).valueOf();
}

// 0 = never active
function lastActive(info: Info): number {
  return Math.max(
    toTime(info.nats.stream?.state.last_ts),
    toTime(info.nats.kv?.state.last_ts),
  );
}

// 0 = never backed up
// function lastBackup(info: Info): number {
//   if (info.backup.stream == null) {
//     return toTime(info.backup.kv?.ts);
//   }
//   if (info.backup.kv == null) {
//     return toTime(info.backup.stream?.ts);
//   }
//   return Math.min(toTime(info.backup.stream?.ts), toTime(info.backup.kv?.ts));
// }

function stringToLocation(s: string): Location | null {
  if (s.startsWith("account-")) {
    return { account_id: s.slice("account-".length) };
  } else if (s.startsWith("project-")) {
    return { project_id: s.slice("project-".length) };
  }
  return null;
}

export const waitUntilReady = reuseInFlight(
  async (location: Location | string | null): Promise<void> => {
    if (location == null) {
      return;
    }
    if (typeof location == "string") {
      location = stringToLocation(location);
      if (location == null) {
        return;
      }
    }
    if (process.env.COCALC_TEST_MODE) {
      // no tiered storage in test mode
      return;
    }
    const key = tieredStorageSubject(location);
    if (readyUntilAtLeast[key] >= Date.now()) {
      // definitely available
      return;
    }
    logger.debug("waitUntilReady", location);
    let d = 1000;
    while (true) {
      await waitUntilConnected();
      const locationInfo = await info(location);
      const active = lastActive(locationInfo);
      if (locationInfo.nats.kv != null || locationInfo.nats.stream != null) {
        // it's live -- only question is how long is it guaranteed
        readyUntilAtLeast[key] = MIN_ARCHIVE_TIME + active;
        return;
      }
      // it's NOT live or it never existed
      if (
        locationInfo.backup.kv == null &&
        locationInfo.backup.stream == null
      ) {
        // never existed, so will get created in the future
        readyUntilAtLeast[key] = MIN_ARCHIVE_TIME + Date.now();
        return;
      }
      try {
        // we have to restore
        await restore(location);
      } catch (err) {
        // it may just be that two clients tried to restore at the same time and
        // one wins.
        d = Math.min(30000, d * 1.25 + Math.random());
        logger.debug(
          `waitUntilReady -- WARNING: problem restoring archived nats data -- will retry in ${d}ms -- ${err}`,
        );
        await delay(d);
        continue;
      }
      // success
      readyUntilAtLeast[key] = MIN_ARCHIVE_TIME + Date.now();
      return;
    }
  },
);

export async function restore(location: Location): Promise<Info> {
  logger.debug("restore", location);
  return (await call("restore", location)) as Info;
}

export async function archive(location: Location): Promise<Info> {
  logger.debug("archive", location);
  return (await call("archive", location)) as Info;
}

export async function backup(location: Location): Promise<Info> {
  logger.debug("backup", location);
  return (await call("backup", location)) as Info;
}

export async function info(location: Location): Promise<Info> {
  logger.debug("info", location);
  return (await call("info", location)) as Info;
}

async function call(command: Command, location: Location) {
  const subject = tieredStorageSubject(location);
  const { cn } = await getEnv();
  const resp = await cn.request(
    subject,
    { command },
    {
      timeout: TIMEOUT[command],
    },
  );
  const x = resp.data;
  if (x?.error) {
    throw Error(x.error);
  } else {
    return x;
  }
}
