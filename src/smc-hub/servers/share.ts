/*
 Serve the share server; this is the old server side rendered share server.
 This is being rewritten in next.js, but that rewrite is not done yet.
 */

import { join } from "path";
import base_path from "smc-util-node/base-path";
import { projects } from "smc-util-node/data";
import { database } from "./database";
import { getLogger } from "../logger";

// Create and expose the share server at the endpoint base_path/share/.
export default async function init(app): Promise<void> {
  const winston = getLogger("init_share_server");
  const path = `${projects}/[project_id]`;
  const url = join(base_path, "share");
  winston.info(
    `initializing share server at "${url}", with files from "${path}"`
  );

  const { share_router } = await import("../share/server");
  const router = share_router({ database, path });
  app.use(url, router);
  winston.info("finished initializing the share server");
}
