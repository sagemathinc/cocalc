/*
Support user uploading files directly to CoCalc from their browsers.

- uploading to projects and compute servers, with full support for potentially
  very LARGE file uploads that stream via NATS.  This checks users is authenticated
  with write access.

- uploading blobs to our database.

Which of the above happens depends on query params.

NOTE:  Code for downloading files from projects/compute servers
is in the middle of packages/hub/proxy/handle-request.ts
*/

// See also ./blob-upload.ts, which is similar, but targets our main
// database instead of projects, and doesn't need to worry about streaming.

import { Router } from "express";
import { getLogger } from "@cocalc/hub/logger";
import getAccount from "@cocalc/server/auth/get-account";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import formidable from "formidable";
import { readFile, unlink } from "fs/promises";

const logger = getLogger("hub:servers:app:blob-upload");
function dbg(...args): void {
  logger.debug("upload ", ...args);
}

export default function init(router: Router) {
  router.post("/upload", async (req, res) => {
    const account_id = await getAccount(req);
    if (!account_id) {
      res.status(500).send("user must be signed in to upload files");
      return;
    }
    const { project_id, compute_server_id, dest, ttl, blob } = req.query;
    if (!blob || project_id) {
      if (
        typeof project_id != "string" ||
        !(await isCollaborator({ account_id, project_id }))
      ) {
        res.status(500).send("user must be collaborator on project");
        return;
      }
    }

    dbg({ account_id, project_id, compute_server_id, dest, ttl, blob });

    try {
      const form = formidable({
        keepExtensions: true,
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
      if (files.file?.[0] != null) {
        const { filepath } = files.file[0];
        try {
          dbg("got", files);
          dbg("got ", await readFile(filepath));
        } finally {
          try {
            await unlink(filepath);
          } catch (err) {
            dbg("WARNING -- failed to delete uploaded file", err);
          }
        }
      }
      res.send({ status: "ok", files });
    } catch (err) {
      dbg("upload failed ", err);
      res.status(500).send(`upload failed -- ${err}`);
    }
  });
}
