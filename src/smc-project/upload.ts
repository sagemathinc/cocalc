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

import { appendFile, rename, readFile, unlink } from "fs";
import { join } from "path";
import { series } from "async";
import * as mkdirp from "mkdirp";
import { IncomingForm } from "formidable";

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

  router.post("/.smc/upload", function (req, res) {
    function dbg(...m): void {
      if (logger == null) return;
      logger.debug("upload POST ", ...m);
    }
    // See https://github.com/felixge/node-formidable; user uploaded a file
    dbg();

    // See http://stackoverflow.com/questions/14022353/how-to-change-upload-path-when-use-formidable-with-express-in-node-js
    const options = {
      uploadDir: join(process.env.HOME ?? "/home/user", req.query.dest_dir),
      keepExtensions: true,
    };
    const form = new IncomingForm(options);
    // Important to set this, since the default is a measly 2MB!
    // See https://stackoverflow.com/questions/13374238/how-to-limit-upload-file-size-in-express-js
    form.maxFileSize = MAX_FILE_SIZE_MB * 1024 * 1024;
    return series(
      [
        (
          cb // ensure target path exists
        ) => mkdirp(options.uploadDir, cb),
        (cb) =>
          form.parse(req, function (err, fields, files) {
            if (
              err ||
              files.file == null ||
              files.file.path == null ||
              files.file.name == null
            ) {
              dbg(
                `upload of '${files.file.name}' to '${files.file.path}' FAILED `,
                err
              );
              cb(err);
              return;
            }
            dbg(
              `upload of '${files.file.name}' to '${
                files.file.path
              }' worked; ${JSON.stringify(fields)}`
            );
            const dest =
              process.env.HOME +
              "/" +
              (req.query.dest_dir != null ? req.query.dest_dir : "") +
              "/" +
              files.file.name;
            if (fields.dzchunkindex == null) {
              // old client that doesn't use chunking...
              dbg(`now move '${files.file.path}' to '${dest}'`);
              return rename(files.file.path, dest, function (err) {
                if (err) {
                  dbg(`error moving -- ${err}`);
                  cb(err);
                } else {
                  cb();
                }
              });
            } else {
              dbg("append the next chunk onto the destination file...");
              handle_chunk_data(
                parseInt(fields.dzchunkindex),
                parseInt(fields.dztotalchunkcount),
                files.file.path,
                dest,
                cb
              );
            }
          }),
      ],
      function (err) {
        if (err) {
          res.status(500).send(`upload failed -- ${err}`);
        } else {
          res.send("received upload:\n\n");
        }
      }
    );
  });

  return router;
}

var handle_chunk_data = function (index, total, chunk, dest, cb) {
  const temp = dest + ".partial-upload";
  return series(
    [
      function (cb) {
        if (index === 0) {
          // move chunk to the temp file
          rename(chunk, temp, cb);
        } else {
          // append chunk to the temp file
          readFile(chunk, function (err, data) {
            if (err) {
              cb(err);
            } else {
              appendFile(temp, data, function (err) {
                if (err) {
                  return cb(err);
                } else {
                  unlink(chunk, cb);
                }
              });
            }
          });
        }
      },
      function (cb) {
        // if it's the last chunk, move temp to actual file.
        if (index === total - 1) {
          rename(temp, dest, cb);
        } else {
          cb();
        }
      },
    ],
    cb
  );
};
