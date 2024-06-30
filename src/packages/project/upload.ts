/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Upload form handler
*/

// This is a limit on the size of each *chunk* that the frontend sends,
// not the total size of the file...
const MAX_FILE_SIZE_MB = 10000;

import { Router } from "express";
import formidable from "formidable";
import { promises as fs, constants as fs_constants } from "node:fs";
import {
  appendFile,
  copyFile,
  mkdir,
  readFile,
  rename,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { handleCopy } from "@cocalc/sync-fs/lib/handle-api-call";

const { F_OK, W_OK, R_OK } = fs_constants;

import ensureContainingDirectoryExists from "@cocalc/backend/misc/ensure-containing-directory-exists";
import { getLogger } from "./logger";

const logger = getLogger("project:upload");

export default function init(): Router {
  logger.info("configuring the upload endpoint");

  const router = Router();

  router.get("/.smc/upload", function (_, res) {
    logger.http("upload GET");
    return res.send("hello");
  });

  router.post("/.smc/upload", async function (req, res): Promise<void> {
    function dbg(...m): void {
      logger.http("upload POST ", ...m);
    }
    // See https://github.com/felixge/node-formidable; user uploaded a file

    // See http://stackoverflow.com/questions/14022353/how-to-change-upload-path-when-use-formidable-with-express-in-node-js
    // Important to set maxFileSize, since the default is 200MB!
    // See https://stackoverflow.com/questions/13374238/how-to-limit-upload-file-size-in-express-js
    const { dest_dir } = req.query;
    const compute_server_id = getComputeServerId(req);

    dbg({ dest_dir, compute_server_id });

    if (typeof dest_dir != "string") {
      res.status(500).send("query param dest_dir must be a string");
      return;
    }
    const { HOME } = process.env;
    if (!HOME) {
      throw Error("HOME env var must be set");
    }

    try {
      const uploadDir = join(HOME, dest_dir);

      // ensure target path exists
      dbg("ensure target path exists... ", uploadDir);
      await mkdir(uploadDir, { recursive: true });

      // we check explicitly, otherwise: https://github.com/sagemathinc/cocalc/issues/7513
      dbg("check if uploadDir has read/writewrite permissions... ", uploadDir);
      try {
        await fs.access(uploadDir, F_OK | R_OK | W_OK);
      } catch {
        throw new Error("upload directory does not have write permissions");
      }

      const form = formidable({
        uploadDir,
        keepExtensions: true,
        maxFileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
      });

      dbg("parsing form data...");
      // https://github.com/node-formidable/formidable?tab=readme-ov-file#parserequest-callback
      const [fields, files] = await form.parse(req);
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

      > fields
      {
        dzuuid: [ 'b4a26289-ddd5-42fc-bfa8-b18847a048a3' ],
        dzchunkindex: [ '0' ],
        dztotalfilesize: [ '80789' ],
        dzchunksize: [ '8000000' ],
        dztotalchunkcount: [ '1' ],
        dzchunkbyteoffset: [ '0' ]
      }
      */

      // Now, the strategy is to assemble to file chunk by chunk and save it with the original filename
      const chunkFullPath = files.file[0]?.filepath;
      const originalFn = files.file[0]?.originalFilename;

      if (chunkFullPath == null || originalFn == null) {
        dbg("error parsing form data");
        throw Error("files.file[0].[filepath | originalFilename] is null");
      } else {
        dbg(`uploading '${chunkFullPath}' -> '${originalFn}'`);
      }

      const dest = join(HOME, dest_dir, originalFn);
      dbg(`dest='${dest}'`);
      await ensureContainingDirectoryExists(dest);

      dbg("append the next chunk onto the destination file...");
      await handle_chunk_data(
        parseInt(fields.dzchunkindex),
        parseInt(fields.dztotalchunkcount),
        chunkFullPath,
        dest,
        dest_dir,
        compute_server_id,
      );

      res.send("received upload:\n\n");
    } catch (err) {
      dbg("upload failed ", err);
      res.status(500).send(`upload failed -- ${err}`);
    }
  });
  return router;
}

function getComputeServerId(req) {
  try {
    return parseInt(req.query.compute_server_id ?? "0");
  } catch (_) {
    return 0;
  }
}

async function handle_chunk_data(
  index: number,
  total: number,
  chunk: string,
  dest: string,
  dest_dir: string,
  compute_server_id: number,
): Promise<void> {
  const temp = dest + ".partial-upload";
  if (index === 0) {
    // move chunk to the temp file
    await moveFile(chunk, temp);
  } else {
    // append chunk to the temp file
    const data = await readFile(chunk);
    await appendFile(temp, data);
    await unlink(chunk);
  }
  // if it's the last chunk, move temp to actual file.
  if (index === total - 1) {
    await moveFile(temp, dest, dest_dir, compute_server_id);
  }
}

async function moveFile(
  src: string,
  dest: string,
  dest_dir?: string,
  compute_server_id?: number,
): Promise<void> {
  try {
    if (compute_server_id) {
      // The final destination of this file upload is a compute server.
      // We copy the temp file (src) to the compute server, then remove
      // the temp file.
      // TODO: it would obviously be much more efficient to upload directly
      // to the compute server without going through cocalc at all.  For
      // various reasons that is simply impossible in general, unfortunately.
      logger.debug("move temporary file to compute server", {
        src,
        dest,
        dest_dir,
        compute_server_id,
      });

      // input to handleCopy must be relative to home directory,
      // but src and dest are absolute paths got by putting HOME
      // in the front of them:
      const { HOME } = process.env;
      if (!HOME) {
        throw Error("HOME env var must be set");
      }
      await rename(src, dest);
      await handleCopy({
        event: "copy_from_project_to_compute_server",
        compute_server_id,
        paths: [dest.slice(HOME.length + 1)],
        dest: dest_dir,
      });
      return;
    }

    logger.debug("move temporary file to dest", {
      src,
      dest,
    });
    try {
      await rename(src, dest);
    } catch (_) {
      // in some cases, e.g., cocalc-docker, this happens:
      //   "EXDEV: cross-device link not permitted"
      // so we just try again the slower way.  This is slightly
      // inefficient, maybe, but more robust than trying to determine
      // if we are doing a cross device rename.
      await copyFile(src, dest);
    }
  } finally {
    try {
      await unlink(src);
    } catch (_) {}
  }
}
