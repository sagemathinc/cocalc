import { type Client, type ConatSocketServer } from "@cocalc/conat/core/client";
import { uuid } from "@cocalc/util/misc";
import { UsageMonitor } from "@cocalc/conat/monitor/usage";
import { getLogger } from "@cocalc/conat/client";
import { isValidUUID } from "@cocalc/util/misc";
import {
  SUBJECT,
  MAX_PER_ACCOUNT,
  MAX_GLOBAL,
  SERVER_KEEPALIVE,
  KEEPALIVE_TIMEOUT,
  RESOURCE,
} from "./util";
export { type ConatSocketServer };

const logger = getLogger("hub:changefeeds:server");

export function changefeedServer({
  client,
  userQuery,
  cancelQuery,
}: {
  client: Client;

  userQuery: (opts: {
    query: object;
    options?: object[];
    account_id: string;
    changes: string;
    cb: Function;
  }) => void;

  cancelQuery: (uuid: string) => void;
}): ConatSocketServer {
  logger.debug("creating changefeed server");

  const usage = new UsageMonitor({
    maxPerUser: MAX_PER_ACCOUNT,
    max: MAX_GLOBAL,
    resource: RESOURCE,
    log: (...args) => {
      logger.debug(RESOURCE, ...args);
    },
  });

  const server = client.socket.listen(SUBJECT, {
    keepAlive: SERVER_KEEPALIVE,
    keepAliveTimeout: KEEPALIVE_TIMEOUT,
  });

  server.on("connection", (socket) => {
    const v = socket.subject.split(".")[1];
    if (!v?.startsWith("account-")) {
      socket.write({ error: "only account users can create changefeeds" });
      socket.close();
      return;
    }
    const account_id = v.slice("account-".length);
    if (!isValidUUID(account_id)) {
      socket.write({
        error: `invalid account_id -- '${account_id}',  subject=${socket.subject}`,
      });
      socket.close();
      return;
    }
    let added = false;
    try {
      usage.add(account_id);
      added = true;
    } catch (err) {
      socket.write({ error: `${err}`, code: err.code });
      socket.close();
      return;
    }

    const changes = uuid();

    socket.on("closed", () => {
      if (added) {
        usage.delete(account_id);
      }
      cancelQuery(changes);
    });

    let running = false;
    socket.on("data", (data) => {
      if (running) {
        socket.write({ error: "exactly one query per connection" });
        socket.close();
        return;
      }
      running = true;
      const { query, options } = data;
      try {
        userQuery({
          query,
          options,
          changes,
          account_id,
          cb: (error, update) => {
            // logger.debug("got: ", { error, update });
            try {
              socket.write({ error, update });
            } catch (err) {
              // happens if buffer is full or socket is closed.  in both cases, might was well
              // just close the socket.
              error = `${err}`;
            }
            if (error) {
              socket.close();
            }
          },
        });
      } catch (err) {
        logger.debug("error creating query", err);
        try {
          socket.write({ error: `${err}` });
        } catch {}
        socket.close();
      }
    });
  });
  server.on("closed", () => {
    logger.debug("shutting down changefeed server");
    usage.close();
  });

  return server;
}
