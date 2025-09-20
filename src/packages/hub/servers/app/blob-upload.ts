/*
Support user uploading a blob directly from their browser to the CoCalc database,
mainly for markdown documents.  This is meant to be very similar to how GitHub
allows for attaching files to github issue comments.
*/

// See also src/packages/project/upload.ts

import { Router } from "express";
import { callback2 } from "@cocalc/util/async-utils";
import { database } from "../database";
const { save_blob } = require("@cocalc/hub/blobs");
import { getLogger } from "@cocalc/hub/logger";
import { MAX_BLOB_SIZE } from "@cocalc/util/db-schema/blobs";
import getAccount from "@cocalc/server/auth/get-account";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import formidable from "formidable";
import { readFile, unlink } from "fs/promises";
import { uuidsha1 } from "@cocalc/backend/misc_node";

const logger = getLogger("hub:servers:app:blob-upload");
function dbg(...args): void {
  logger.debug("upload ", ...args);
}

export default function init(router: Router) {
  router.post("/blobs", async (req, res) => {
    const account_id = await getAccount(req);
    if (!account_id) {
      res.status(500).send("user must be signed in to upload files");
      return;
    }
    const { project_id, ttl } = req.query;
    if (typeof project_id == "string" && project_id) {
      if (!(await isCollaborator({ account_id, project_id }))) {
        res.status(500).send("user must be collaborator on project");
        return;
      }
    }

    dbg({ account_id, project_id });

    // TODO: check for throttling/limits
    try {
      const form = formidable({
        keepExtensions: true,
        maxFileSize: MAX_BLOB_SIZE,
        hashAlgorithm: "sha1",
      });

      dbg("parsing form data...");
      // https://github.com/node-formidable/formidable?tab=readme-ov-file#parserequest-callback
      const [_, files] = await form.parse(req);
      //dbg(`finished parsing form data. ${JSON.stringify({ fields, files })}`);

      /* Just for the sake of understanding this, this is how this looks like in the real world (formidable@3):
      > files.file[0]
      {
        size: 80789,
        filepath: '/home/hsy/p/cocalc/src/data/projects/c8787b71-a85f-437b-9d1b-29833c3a199e/asdf/asdf/8e3e4367333e45275a8d1aa03.png',
        newFilename: '8e3e4367333e45275a8d1aa03.png',
        mimetype: 'application/octet-stream',
        mtime: '2024-04-23T09:25:53.197Z',
        originalFilename: 'Screenshot from 2024-04-23 09-20-40.png'
      }
      */
      let uuid: string | undefined = undefined;
      if (files.file?.[0] != null) {
        const { filepath, hash } = files.file[0];
        try {
          dbg("got", files);
          if (typeof hash == "string") {
            uuid = uuidsha1("", hash);
          }
          const blob = await readFile(filepath);
          await callback2(save_blob, {
            uuid,
            blob,
            ttl,
            project_id,
            database,
            account_id,
          });
        } finally {
          try {
            await unlink(filepath);
          } catch (err) {
            dbg("WARNING -- failed to delete uploaded file", err);
          }
        }
      }
      if (!uuid) {
        res.status(500).send("no file got uploaded");
        return;
      }
      res.send({ uuid });
    } catch (err) {
      dbg("upload failed ", err);
      res.status(500).send(`upload failed -- ${err}`);
    }
  });
}
