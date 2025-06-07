import { type Client, type ConatSocketServer } from "@cocalc/conat/core/client";
import { uuid } from "@cocalc/util/misc";
import { EventIterator } from "@cocalc/util/event-iterator";
import { getLogger } from "@cocalc/conat/client";
export { type ConatSocketServer };

const logger = getLogger("hub:changefeeds");

const SERVICE = "changefeeds";
const SUBJECT = "changefeeds.*";

const MAX_PER_ACCOUNT = 200;
const numPerAccount: { [account_id: string]: number } = {};

const CLIENT_KEEPALIVE = 90000;
const SERVER_KEEPALIVE = 45000;
const KEEPALIVE_TIMEOUT = 10000;

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
  const server = client.socket.listen(SUBJECT, {
    keepAlive: SERVER_KEEPALIVE,
    keepAliveTimeout: KEEPALIVE_TIMEOUT,
  });
  let numConnections = 0;

  server.on("connection", (socket) => {
    const account_id = socket.subject.split(".")[1].slice("account-".length);
    if ((numPerAccount[account_id] ?? 0) >= MAX_PER_ACCOUNT) {
      logger.debug("limit", {
        account_id,
        global: numConnections,
        account: numPerAccount[account_id],
      });
      try {
        socket.write({
          error: `there is a limit of ${MAX_PER_ACCOUNT} changefeeds per account`,
        });
      } catch {}
      socket.close();
    }
    numPerAccount[account_id] = (numPerAccount[account_id] ?? 0) + 1;
    numConnections++;
    logger.debug("new connection", {
      account_id,
      global: numConnections,
      account: numPerAccount[account_id],
    });

    const changes = uuid();
    socket.on("closed", () => {
      numConnections--;
      numPerAccount[account_id] = (numPerAccount[account_id] ?? 0) - 1;
      logger.debug("close connection ", {
        account_id,
        global: numConnections,
        account: numPerAccount[account_id],
      });
      cancelQuery(changes);
    });
    socket.on("data", (data) => {
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
  });

  return server;
}

type Update = any;

function changefeedSubject({ account_id }: { account_id: string }) {
  return `${SERVICE}.account-${account_id}`;
}

export type Changefeed = EventIterator<{ error?: string; update: Update }>;

export function changefeed({
  query,
  options,
  client,
  account_id,
}: {
  query: object;
  options?: object[];
  client: Client;
  account_id: string;
}) {
  const socket = client.socket.connect(changefeedSubject({ account_id }), {
    reconnection: false,
    keepAlive: CLIENT_KEEPALIVE,
    keepAliveTimeout: KEEPALIVE_TIMEOUT,
  });
  logger.debug("creating changefeed", { query, options });
  // console.log("creating changefeed", { query, options });
  socket.write({ query, options });
  const cf = new EventIterator<{ error?: string; update: Update }>(
    socket,
    "data",
    {
      map: (args) => {
        const { error, update } = args[0] ?? {};
        if (error) {
          // console.log("changefeed: error returned from server, query");
          throw Error(error);
        } else {
          return update;
        }
      },
      onEnd: () => {
        // console.log("changefeed: onEnd", query);
        socket.close();
      },
    },
  );
  socket.on("closed", () => {
    // console.log("changefeed: closed", query);
    cf.throw(Error("closed"));
  });
  socket.on("disconnected", () => {
    //    console.log("changefeed: disconnected", query);
    cf.throw(Error("disconnected"));
  });
  return cf;
}
