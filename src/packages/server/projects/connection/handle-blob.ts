import { is_valid_uuid_string as isValidUUID } from "@cocalc/util/misc";
//import { uuidsha1 } from "@cocalc/backend/misc_node";
const { uuidsha1 } = require("@cocalc/backend/misc_node");
import { db } from "@cocalc/database";
import { callback2 } from "@cocalc/util/async-utils";
import { save_blob } from "@cocalc/util/message";
import getLogger from "@cocalc/backend/logger";
const logger = getLogger("project-connection:handle-blob");

// Blobs (e.g., files and images dynamically appearing as output in worksheets) are kept for this
// many seconds before being discarded.  If the worksheet is saved (e.g., by a user's autosave),
// then the BLOB is saved indefinitely.
const TTL = 60 * 60 * 24; // 1 day
const MAX_BLOB_SIZE = 15000000;
const MAX_BLOB_SIZE_HUMAN = "15MB";

interface Options {
  socket;
  project_id: string;
  uuid: string;
  blob: Buffer;
  ttlSeconds?: number;
}

export default async function handleBlob({
  socket,
  project_id,
  uuid,
  blob,
  ttlSeconds,
}: Options): Promise<void> {
  let resp;
  try {
    await saveBlob({ project_id, uuid, blob });
    resp = save_blob({ sha1: uuid, ttl: ttlSeconds ?? TTL });
  } catch (err) {
    resp = save_blob({ sha1: uuid, error: `${err}` });
  }
  socket.write_mesg("json", resp);
}

async function saveBlob({ project_id, uuid, blob }): Promise<number> {
  logger.debug("saving blob in ", project_id, " with uuid ", uuid);
  // return ttl in seconds.
  if (!isValidUUID(project_id)) throw Error("project_id is invalid");
  if (!isValidUUID(uuid)) throw Error("uuid is invalid");
  if (!blob) throw Error("blob is required");
  if (uuid != uuidsha1(blob)) {
    throw Error("uuid must be the sha1-uuid of blob");
  }
  if (blob.length > MAX_BLOB_SIZE) {
    throw Error(
      `saveBlob: blobs are limited to ${MAX_BLOB_SIZE_HUMAN} and you just tried to save one of size ${
        blob.length / 1000000
      }MB`
    );
  }
  const database = db();
  return await callback2(database.save_blob, {
    uuid,
    blob,
    ttl: TTL,
    project_id,
  });
}
