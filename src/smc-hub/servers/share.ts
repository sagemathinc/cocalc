import { join } from "path";
import base_path from "smc-util-node/base-path";
import { database } from "./database";
import { getLogger } from "../logger";
import { share_router } from "../share/server";

// Create and expose the share server at the endpoint base_path/share/.
export default function init(app, path: string): void {
  const winston = getLogger("init_share_server");
  const url = join(base_path, "share");
  winston.info(
    `initializing share server at "${url}", with files from "${path}"`
  );

  const router = share_router({ database, path });
  app.use(url, router);
  winston.info("finished initializing the share server");
}
