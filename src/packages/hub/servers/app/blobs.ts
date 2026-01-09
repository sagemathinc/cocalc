import { Router } from "express";
import { getDatabase } from "../database";
import { is_valid_uuid_string } from "@cocalc/util/misc";
import { database_is_working } from "@cocalc/server/metrics/hub_register";
import { callback2 } from "@cocalc/util/async-utils";
import { getLogger } from "@cocalc/hub/logger";

const logger = getLogger("hub:servers:app:blobs");
export default function init(router: Router) {
  const database = getDatabase();
  // return uuid-indexed blobs (mainly used for graphics)
  router.get("/blobs/*", async (req, res) => {
    logger.debug(`${JSON.stringify(req.query)}, ${req.path}`);
    const uuid = `${req.query.uuid}`;
    if (req.headers["if-none-match"] === uuid) {
      res.sendStatus(304);
      return;
    }
    if (!is_valid_uuid_string(uuid)) {
      res.status(404).send(`invalid uuid=${uuid}`);
      return;
    }
    if (!database_is_working()) {
      res.status(404).send("can't get blob -- not connected to database");
      return;
    }

    try {
      const data = await callback2(database.get_blob, { uuid });
      if (data == null) {
        res.status(404).send(`blob ${uuid} not found`);
      } else {
        const filename = req.path.slice(req.path.lastIndexOf("/") + 1);
        if (req.query.download != null) {
          // tell browser to download the link as a file instead
          // of displaying it in browser
          res.attachment(filename);
        } else {
          res.type(filename);
        }
        // Cache as long as possible (e.g., One year in seconds), since
        // what we are returning is defined by a sha1 hash, so cannot change.
        res.set("Cache-Control", `public, max-age=${365 * 24 * 60 * 60}`);
        // "public means that the response may be cached by clients and any
        // intermediary caches (like CDNs). max-age determines the amount
        // of time (in seconds) a client should cache the response."
        // The maximum value that you can set for max-age is 1 year
        // (in seconds), which is compliant with the HTTP/1.1
        // specifications (RFC2616)."
        res.set("ETag", uuid);
        res.send(data);
      }
    } catch (err) {
      logger.error(`internal error ${err} getting blob ${uuid}`);
      res.status(500).send(`internal error: ${err}`);
    }
  });
}
