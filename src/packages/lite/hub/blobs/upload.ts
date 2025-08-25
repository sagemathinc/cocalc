import { MAX_BLOB_SIZE } from "@cocalc/util/db-schema/blobs";
import formidable from "formidable";
import { readFile, unlink } from "fs/promises";
import { uuidsha1 } from "@cocalc/backend/misc_node";
import getLogger from "@cocalc/backend/logger";

export const BLOB_STORE_NAME = "blobs";

const logger = getLogger("lite:hub:blobs:upload");

export default function init(app, conatClient) {
  const blobStore = conatClient.sync.akv({ name: BLOB_STORE_NAME });
  logger.debug("initialized blob upload service");
  global.blobStore = blobStore;
  app.post("/blobs", async (req, res) => {
    const { ttl } = req.query;
    try {
      const form = formidable({
        keepExtensions: true,
        maxFileSize: MAX_BLOB_SIZE,
        hashAlgorithm: "sha1",
      });

      const [_, files] = await form.parse(req);
      let uuid: string | undefined = undefined;
      if (files.file?.[0] != null) {
        const { filepath, hash } = files.file[0];
        try {
          if (typeof hash == "string") {
            uuid = uuidsha1("", hash);
          }
          logger.debug("got blob ", uuid);
          const blob = await readFile(filepath);
          await blobStore.set(uuid, blob, { ttl });
        } finally {
          try {
            await unlink(filepath);
          } catch (err) {
            logger.debug("WARNING -- failed to delete uploaded file", err);
          }
        }
      }
      if (!uuid) {
        res.status(500).send("no file got uploaded");
        return;
      }
      res.send({ uuid });
    } catch (err) {
      res.status(500).send(`upload failed -- ${err}`);
    }
  });
}
