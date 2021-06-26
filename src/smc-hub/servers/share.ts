import { join } from "path";
import base_path from "smc-util-node/base-path";
import { database } from "./database";
import { getLogger } from "../logger";
//import { share_router } from "../share/server";

// Create and expose the share server at the endpoint base_path/share/.
export default async function init(app, path: string): Promise<void> {
  const winston = getLogger("init_share_server");
  const url = join(base_path, "share");
  winston.info(
    `initializing share server at "${url}", with files from "${path}"`
  );

  const { share_router } = await import("../share/server");
  const router = share_router({ database, path });
  app.use(url, router);
  winston.info("finished initializing the share server");
}
