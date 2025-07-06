/*

COCALC_SERVICE

*/

import { delay } from "awaiting";
import type { ConatServer } from "@cocalc/conat/core/server";
import { lookup } from "dns/promises";
import port from "@cocalc/backend/port";
import { getLogger } from "@cocalc/backend/logger";

const SCAN_INTERVAL = 15_000;

const logger = getLogger("conat:socketio:dns-scan");

export async function dnsScan(server: ConatServer) {
  logger.debug("starting dnsScan");
  await delay(3000);
  while (server.state != "closed") {
    try {
      const addresses = await getAddresses();
      logger.debug("DNS can revealed", addresses);
      for (const address of addresses) {
        logger.debug("joining", address);
        if (server.state == ("closed" as any)) return;
        try {
          await server.join(address);
        } catch (err) {
          logger.debug(`WARNING: error joining to ${address} -- ${err}`);
        }
      }
    } catch (err) {
      logger.debug(`WARNING: error doing dns scan -- ${err}`);
    }
    await delay(SCAN_INTERVAL);
  }
}

export async function getAddresses(): Promise<string[]> {
  const v: string[] = [];
  for (const { address } of await lookup(
    process.env.COCALC_SERVICE ?? "hub-conat-router",
    { all: true },
  )) {
    v.push(`http://${address}:${port}`);
  }
  return v;
}
