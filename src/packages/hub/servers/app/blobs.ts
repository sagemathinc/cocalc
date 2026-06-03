import { Router } from "express";
import { basename, extname } from "node:path";

import { getDatabase } from "../database";
import { is_valid_uuid_string } from "@cocalc/util/misc";
import { database_is_working } from "@cocalc/server/metrics/hub_register";
import { callback2 } from "@cocalc/util/async-utils";
import { getLogger } from "@cocalc/hub/logger";

const logger = getLogger("hub:servers:app:blobs");

const SAFE_INLINE_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".bmp",
  ".ico",
]);

function safeFilenameFromPath(pathname: string): string {
  const name = basename(pathname || "") || "blob";
  return name.replace(/[^\w.\-()+ ]+/g, "_");
}

function shouldInlineByFilename(filename: string): boolean {
  const ext = extname(filename).toLowerCase();
  return SAFE_INLINE_IMAGE_EXTENSIONS.has(ext);
}

export default function init(router: Router) {
  const database = getDatabase();
  // return uuid-indexed blobs (mainly used for graphics)
  router.get("/blobs/{*splat}", async (req, res) => {
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
        const filename = safeFilenameFromPath(req.path);
        const forceDownload =
          req.query.download != null || !shouldInlineByFilename(filename);
        if (forceDownload) {
          // Force download for anything that is not an explicitly safe inline
          // type, to avoid serving executable content (e.g. HTML/SVG/JS) on
          // hub origin.
          res.attachment(filename);
        } else {
          res.type(filename);
        }
        res.set("X-Content-Type-Options", "nosniff");
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
      res.status(500).send("internal error getting blob");
    }
  });
}
