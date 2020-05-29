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

import { appendFile, mkdir, rename, readFile, unlink } from "fs";
import { join } from "path";
import { IncomingForm } from "formidable";
import { callback } from "awaiting";

export function upload_endpoint(
  express,
  logger?: { debug: (...args) => void }
) {
  if (logger != null) {
    logger.debug("upload_endpoint conf");
  }

  const router = express.Router();

  router.get("/.smc/upload", function (_, res) {
    if (logger != null) {
      logger.debug("upload GET");
    }
    return res.send("hello");
  });

  router.post("/.smc/upload", async function (req, res): Promise<void> {
    function dbg(...m): void {
      if (logger == null) return;
      logger.debug("upload POST ", ...m);
    }
    // See https://github.com/felixge/node-formidable; user uploaded a file
    dbg();

    // See http://stackoverflow.com/questions/14022353/how-to-change-upload-path-when-use-formidable-with-express-in-node-js
    // Important to set maxFileSize, since the default is 200MB!
    // See https://stackoverflow.com/questions/13374238/how-to-limit-upload-file-size-in-express-js
    const options = {
      uploadDir: join(process.env.HOME ?? "/home/user", req.query.dest_dir),
      keepExtensions: true,
      maxFileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
    };
    const form = new IncomingForm(options);

    try {
      // ensure target path exists
      dbg("ensure target path exists... ", options.uploadDir);
      await callback(mkdir, options.uploadDir, { recursive: true });
      dbg("parsing form data...");
      const { fields, files } = await callback(form_parse, form, req);
      dbg("finished parsing form data.");
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

      const dest = join(
        process.env.HOME ?? "/home/user",
        req.query.dest_dir ?? "",
        files.file.name
      );

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
    await callback(rename, chunk, temp);
  } else {
    // append chunk to the temp file
    const data = await callback(readFile, chunk);
    await callback(appendFile, temp, data);
    await callback(unlink, chunk);
  }
  // if it's the last chunk, move temp to actual file.
  if (index === total - 1) {
    await callback(rename, temp, dest);
  }
}

// Get around that form.parse returns two extra args in its callback
function form_parse(form, req, cb): void {
  form.parse(req, (err, fields, files) => {
    cb(err, { fields, files });
  });
}
