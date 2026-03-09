import { getLogger } from "@cocalc/conat/client";
import { type Client, type ConatSocketServer } from "@cocalc/conat/core/client";
import { UsageMonitor } from "@cocalc/conat/monitor/usage";
import { isValidUUID, uuid } from "@cocalc/util/misc";

import {
  KEEPALIVE_TIMEOUT,
  MAX_GLOBAL,
  MAX_PER_ACCOUNT,
  RESOURCE,
  SERVER_KEEPALIVE,
  SUBJECT,
} from "./util";

export { type ConatSocketServer };

const logger = getLogger("hub:changefeeds:server");

type CounterByAccount = Map<string, number>;

const stats = {
  serversCreated: 0,
  serverClosed: 0,
  connections: 0,
  activeSockets: 0,
  socketClosed: 0,
  closeDueToNonAccount: 0,
  closeDueToInvalidUuid: 0,
  closeDueToUsageLimit: 0,
  closeDueToMultipleQueries: 0,
  closeDueToCreateQueryError: 0,
  closeDueToCallbackError: 0,
};

const connectionsByAccount: CounterByAccount = new Map();
const activeByAccount: CounterByAccount = new Map();

function bumpCounterByAccount(
  map: CounterByAccount,
  accountId: string,
  delta: number = 1,
) {
  if (!accountId) return;
  const value = (map.get(accountId) ?? 0) + delta;
  if (value <= 0) {
    map.delete(accountId);
  } else {
    map.set(accountId, value);
  }
}

function topCounters(map: CounterByAccount, limit: number) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([account_id, count]) => ({ account_id, count }));
}

function sumCounters(map: CounterByAccount): number {
  let total = 0;
  for (const value of map.values()) {
    total += value;
  }
  return total;
}

export function getChangefeedServerDebugStats({
  topN = 8,
}: {
  topN?: number;
} = {}) {
  const top = Math.max(1, topN);
  return {
    ...stats,
    connectionsByAccountTotal: sumCounters(connectionsByAccount),
    activeByAccountTotal: sumCounters(activeByAccount),
    connectionsByAccountTop: topCounters(connectionsByAccount, top),
    activeByAccountTop: topCounters(activeByAccount, top),
  };
}

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
  stats.serversCreated += 1;
  logger.debug("created changefeed server with id", server.id);

  server.on("connection", (socket) => {
    stats.connections += 1;
    const v = socket.subject.split(".")[1];
    logger.debug(server.id, "connection from ", v);
    if (!v?.startsWith("account-")) {
      stats.closeDueToNonAccount += 1;
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
      stats.closeDueToInvalidUuid += 1;
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

    const changes = uuid();
    let added = false;
    let tracked = false;

    socket.on("closed", () => {
      if (tracked) {
        stats.socketClosed += 1;
        stats.activeSockets = Math.max(0, stats.activeSockets - 1);
      }
      logger.debug(
        "socket.close: cleaning up since socket closed for some external reason (timeout?)",
        socket.subject,
      );
      if (added) {
        usage.delete(account_id);
        bumpCounterByAccount(activeByAccount, account_id, -1);
      }
      cancelQuery(changes);
    });

    try {
      usage.add(account_id);
      added = true;
      tracked = true;
      stats.activeSockets += 1;
      bumpCounterByAccount(connectionsByAccount, account_id, 1);
      bumpCounterByAccount(activeByAccount, account_id, 1);
    } catch (err) {
      stats.closeDueToUsageLimit += 1;
      socket.write({ error: `${err}`, code: err.code });
      logger.debug(
        "socket.close: due to usage error (limit exceeded?)",
        socket.subject,
        err,
      );
      socket.close();
      return;
    }

    let running = false;
    socket.on("data", (data) => {
      if (running) {
        stats.closeDueToMultipleQueries += 1;
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
            if (error) {
              error = `error from postgres: "${error}"`;
            }
            try {
              socket.write({ error, update });
            } catch (err) {
              if (`${err}`.includes("closed")) {
                socket.close();
                return;
              }
              error = `${error ? error + "; " : ""}unable to send (buffer may be full -- closing) `;
            }
            if (error) {
              stats.closeDueToCallbackError += 1;
              logger.debug(error, socket.subject);
              socket.close();
            }
          },
        });
      } catch (err) {
        stats.closeDueToCreateQueryError += 1;
        logger.debug(
          "socket.close: due to error creating query",
          socket.subject,
          err,
        );
        try {
          socket.write({ error: `${err}` });
        } catch {}
        socket.close();
      }
    });
  });

  server.on("closed", () => {
    stats.serverClosed += 1;
    logger.debug("shutting down changefeed server");
    usage.close();
  });

  return server;
}
