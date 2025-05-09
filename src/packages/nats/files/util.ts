import { delay } from "awaiting";
import { waitUntilConnected } from "@cocalc/nats/util";
import { getLogger } from "@cocalc/nats/client";

const logger = getLogger("files:util");

export async function runLoop({ subs, listen, opts, subject, nc }) {
  while (true) {
    const sub = nc.subscribe(subject);
    subs[subject] = sub;
    try {
      await listen({ ...opts, sub });
    } catch (err) {
      logger.debug(`runLoop: error - ${err}`);
    }
    if (subs[subject] == null) return;
    await delay(3000 + Math.random());
    await waitUntilConnected();
    if (subs[subject] == null) return;
    logger.debug(`runLoop: will restart`);
  }
}
