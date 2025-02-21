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
import { PassThrough } from "node:stream";

const logger = getLogger("hub:servers:app:upload");

export default function init(router: Router) {
  router.post("/upload", async (req, res) => {
    const account_id = await getAccount(req);
    if (!account_id) {
      res.status(500).send("user must be signed in to upload files");
      return;
    }
    const { project_id, compute_server_id, path, ttl, blob } = req.query;
    if (!blob || project_id) {
      if (
        typeof project_id != "string" ||
        !(await isCollaborator({ account_id, project_id }))
      ) {
        res.status(500).send("user must be collaborator on project");
        return;
      }
    }

    logger.debug({
      account_id,
      project_id,
      compute_server_id,
      path,
      ttl,
      blob,
    });

    try {
      const form = formidable({
        keepExtensions: true,
        hashAlgorithm: "sha1",
        // file = {"size":195,"newFilename":"649205cf239d49f350c645f00.py","originalFilename":"a (2).py","mimetype":"application/octet-stream","hash":"318c0246ae31424f9225b566e7e09bef6c8acc40"}
        fileWriteStreamHandler: (file) => {
          logger.debug("fileWriteStreamHandler", file);
          const stream = new PassThrough();
          if (file == null) {
            return stream;
          }

          // @ts-ignore
          const { originalFilename: filename, hash } = file;
          (async () => {
            for await (const chunk of stream) {
              logger.debug("stream:", { filename, hash, chunk });
            }
          })();

          return stream;
        },
      });

      const [_, files] = await form.parse(req);
      res.send({ status: "ok", files });
    } catch (err) {
      logger.debug("upload failed ", err);
      res.status(500).send(`upload failed -- ${err}`);
    }
  });
}
