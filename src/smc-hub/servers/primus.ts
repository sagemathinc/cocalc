import { join } from "path";
const Primus = require("primus");
import base_path from "smc-util-node/base-path";
import Logger from "smc-util-node/logger";
import setup_primus_client from "smc-hub/primus-client";
const { Client } = require("smc-hub/client");
import { len } from "smc-util/misc";

interface Options {
  http_server: any;
  express_router: any;
  compute_server: any;
  clients: { [id: string]: any }; // todo: when client is in typescript, use proper type...
  database: any;
  host: string;
  isPersonal: boolean;
}

export function init({
  http_server,
  express_router,
  compute_server,
  clients,
  database,
  host,
  isPersonal,
}: Options): void {
  const logger = Logger("primus");

  // It is now safe to change the primusOpts below, and this
  // doesn't require changing anything anywhere else.
  const primusOpts = { pathname: join(base_path, "hub") };
  const primus_server = new Primus(http_server, primusOpts);
  logger.info(`listening on ${primusOpts.pathname}`);

  // Make it so new websocket connection requests get handled:
  primus_server.on("connection", function (conn) {
    // Now handle the connection
    logger.info(`new connection from ${conn.address.ip} -- ${conn.id}`);
    clients[conn.id] = new Client({
      conn,
      logger,
      database,
      compute_server,
      host,
      personal: isPersonal,
    });
    logger.info(`num_clients=${len(clients)}`);
  });

  // Serve the primus.js client code via the express router.
  setup_primus_client(express_router, primus_server);
}
