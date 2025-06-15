import { type Client } from "@cocalc/conat/core/client";
import { EventIterator } from "@cocalc/util/event-iterator";
import { getLogger } from "@cocalc/conat/client";
import { SERVICE, CLIENT_KEEPALIVE, KEEPALIVE_TIMEOUT } from "./util";
import { ConatError } from "@cocalc/conat/core/client";

const logger = getLogger("hub:changefeeds:client");

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
  const table = Object.keys(query)[0];
  const socket = client.socket.connect(changefeedSubject({ account_id }), {
    reconnection: false,
    keepAlive: CLIENT_KEEPALIVE,
    keepAliveTimeout: KEEPALIVE_TIMEOUT,
    desc: `postgresql-changefeed-${table}`,
  });
  logger.debug("creating changefeed", { table, options });
  // console.log("creating changefeed", { query, options });
  socket.write({ query, options });
  const cf = new EventIterator<{ error?: string; update: Update }>(
    socket,
    "data",
    {
      map: (args) => {
        const { error, code, update } = args[0] ?? {};
        if (error) {
          // console.log("changefeed: error returned from server, query");
          throw new ConatError(error, { code });
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
