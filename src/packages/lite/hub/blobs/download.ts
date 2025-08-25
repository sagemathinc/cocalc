/*
Download blob from blob-store
*/

import { BLOB_STORE_NAME } from "./upload";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("lite:hub:blobs:download");

export default function init(app, conatClient) {
  const blobStore = conatClient.sync.akv({ name: BLOB_STORE_NAME });
  logger.debug("initialized blob download service");

  app.get("/blobs/*", async (req, res) => {
    logger.debug(`${JSON.stringify(req.query)}, ${req.path}`);
    const uuid = `${req.query.uuid}`;
    if (req.headers["if-none-match"] === uuid) {
      res.sendStatus(304);
      return;
    }
    try {
      const data = await blobStore.get(uuid);
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
        // see comments in src/packages/hub/servers/app/blobs.ts
        res.set("Cache-Control", `public, max-age=${365 * 24 * 60 * 60}`);
        res.set("ETag", uuid);
        res.send(data);
      }
    } catch (err) {
      logger.error(`WARNING: error getting blob ${uuid}`, err);
      res.status(500).send(`internal error: ${err}`);
    }
  });
}
