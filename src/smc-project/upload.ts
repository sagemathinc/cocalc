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
import { appendFile, mkdir, copyFile, rename, readFile, unlink } from "fs";
import { join } from "path";
import { IncomingForm } from "formidable";
import { callback } from "awaiting";
const {
  ensure_containing_directory_exists,
} = require("smc-util-node/misc_node");
import { getLogger } from "./logger";

export default function init(): Router {
  const winston = getLogger("upload");
  winston.info("configuring the upload endpoint");

  const router = Router();

  router.get("/.smc/upload", function (_, res) {
    winston.http("upload GET");
    return res.send("hello");
  });

  router.post("/.smc/upload", async function (req, res): Promise<void> {
    function dbg(...m): void {
      winston.http("upload POST ", ...m);
    }
    // See https://github.com/felixge/node-formidable; user uploaded a file
    dbg();

    // See http://stackoverflow.com/questions/14022353/how-to-change-upload-path-when-use-formidable-with-express-in-node-js
    // Important to set maxFileSize, since the default is 200MB!
    // See https://stackoverflow.com/questions/13374238/how-to-limit-upload-file-size-in-express-js
    const { dest_dir } = req.query;
    if (typeof dest_dir != "string") {
      res.status(500).send("query parm dest_dir must be a string");
      return;
    }
    const { HOME } = process.env;
    if (!HOME) {
      throw Error("HOME env var must be set");
    }
    const uploadDir = join(HOME, dest_dir);
    const options = {
      uploadDir,
      keepExtensions: true,
      maxFileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
    };
    const form = new IncomingForm(options);
    // Using the uploadDir option to options is broken. formidable is a mess.
    form.uploadDir = uploadDir;

    try {
      // ensure target path existsJS
      dbg("ensure target path exists... ", options.uploadDir);
      await callback(mkdir, options.uploadDir, { recursive: true });
      dbg("parsing form data...");
      const { fields, files } = await callback(form_parse, form, req);
      // dbg(`finished parsing form data. ${JSON.stringify({ fields, files })}`);
      if (files.file?.path == null || files.file?.name == null) {
        dbg("error parsing form data");
        throw Error("files.file.[path | name] is null");
      } else {
        dbg(`uploading '${files.file.name}' -> '${files.file.path}'`);
      }

      dbg(
        `'${files.file.name}' -> '${files.file.path}' worked; ${JSON.stringify(
          fields
        )}`
      );

      const dest = join(HOME, dest_dir, fields.fullPath ?? files.file.name);
      dbg(`dest='${dest}'`);
      await callback(ensure_containing_directory_exists, dest);
      dbg("append the next chunk onto the destination file...");
      await handle_chunk_data(
        parseInt(fields.dzchunkindex),
        parseInt(fields.dztotalchunkcount),
        files.file.path,
        dest
      );

      res.send("received upload:\n\n");
    } catch (err) {
      dbg("upload failed ", err);
      res.status(500).send(`upload failed -- ${err}`);
    }
  });
  return router;
}

async function handle_chunk_data(index, total, chunk, dest): Promise<void> {
  const temp = dest + ".partial-upload";
  if (index === 0) {
    // move chunk to the temp file
    await moveFile(chunk, temp);
  } else {
    // append chunk to the temp file
    const data = await callback(readFile, chunk);
    await callback(appendFile, temp, data);
    await callback(unlink, chunk);
  }
  // if it's the last chunk, move temp to actual file.
  if (index === total - 1) {
    await moveFile(temp, dest);
  }
}

// Get around that form.parse returns two extra args in its callback
function form_parse(form, req, cb): void {
  form.parse(req, (err, fields, files) => {
    cb(err, { fields, files });
  });
}

async function moveFile(src: string, dest: string): Promise<void> {
  try {
    await callback(rename, src, dest);
  } catch (_) {
    // in some cases, e.g., cocalc-docker, this happens:
    //   "EXDEV: cross-device link not permitted"
    // so we just try again the slower way.  This is slightly
    // inefficient, maybe, but more robust than trying to determine
    // if we are doing a cross device rename.
    await callback(copyFile, src, dest);
    await callback(unlink, src);
  }
}
