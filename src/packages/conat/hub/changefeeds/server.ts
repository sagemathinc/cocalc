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
  logger.debug("created changefeed server with id", server.id);

  server.on("connection", (socket) => {
    const v = socket.subject.split(".")[1];
    logger.debug(server.id, "connection from ", v);
    if (!v?.startsWith("account-")) {
      socket.write({ error: "only account users can create changefeeds" });
      logger.debug(
        "socket.close: due to changefeed request from non-account subject",
        socket.subject,
      );
      socket.close();
      return;
    }
    const account_id = v.slice("account-".length);
    if (!isValidUUID(account_id)) {
      logger.debug(
        "socket.close: due to invalid uuid",
        socket.subject,
        account_id,
      );
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
      logger.debug(
        "socket.close: due to usage error (limit exceeded?)",
        socket.subject,
        err,
      );
      socket.close();
      return;
    }

    const changes = uuid();

    socket.on("closed", () => {
      logger.debug(
        "socket.close: cleaning up since socket closed for some external reason (timeout?)",
        socket.subject,
      );
      if (added) {
        usage.delete(account_id);
      }
      cancelQuery(changes);
    });

    let running = false;
    socket.on("data", (data) => {
      if (running) {
        socket.write({ error: "exactly one query per connection" });
        logger.debug(
          "socket.close: due to attempt to run more than one query",
          socket.subject,
        );
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
            if (error) {
              error = `error from postgres: "${error}"`;
            }
            try {
              socket.write({ error, update });
            } catch (err) {
              if (`${err}`.includes("closed")) {
                // expected behavior when other side closed it
                socket.close();
                return;
              }
              // happens if buffer is full. we just close the socket for now. (TODO?)
              error = `${error ? error + "; " : ""}unable to send (buffer may be full -- closing) `;
            }
            if (error) {
              logger.debug(error, socket.subject);
              socket.close();
            }
          },
        });
      } catch (err) {
        logger.debug(
          "socket.close: due to error creating query",
          socket.subject,
          err,
        );
        try {
          socket.write(err);
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
