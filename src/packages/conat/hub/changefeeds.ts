import { type Client } from "@cocalc/conat/core/client";
import { uuid } from "@cocalc/util/misc";
import { EventIterator } from "@cocalc/util/event-iterator";
import { getLogger } from "@cocalc/conat/client";

const logger = getLogger("hub:changefeeds");

const SERVICE = "changefeeds";
const SUBJECT = "changefeeds.*";

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
}) {
  logger.debug("creating changefeed server");
  const server = client.socket.listen(SUBJECT);

  server.on("connection", (socket) => {
    const account_id = socket.subject.split(".")[1].slice("account-".length);
    const changes = uuid();
    socket.on("closed", () => {
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
            socket.write({ error, update });
            if (error) {
              socket.close();
            }
          },
        });
      } catch (err) {
        logger.debug("error creating query", err);
        socket.write({ error: `${err}` });
        socket.close();
      }
    });
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
  });
  logger.debug("creating changefeed", { query, options });
  socket.write({ query, options });
  const cf = new EventIterator<{ error?: string; update: Update }>(
    socket,
    "data",
    {
      map: (args) => {
        const { error, update } = args[0] ?? {};
        if (error) {
          throw Error(error);
        } else {
          return update;
        }
      },
      onEnd: () => {
        socket.close();
      },
    },
  );
  socket.on("closed", () => cf.throw(Error("closed")));
  socket.on("disconnected", () => cf.throw(Error("disconnected")));
  return cf;
}
