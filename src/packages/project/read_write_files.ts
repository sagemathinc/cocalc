/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
//########################################################################
// This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
// License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
//########################################################################

import { stat, readFile, Stats, exists, unlink } from "node:fs";
import * as temp from "temp";
import { execFile } from "node:child_process";
import { CoCalcSocket } from "@cocalc/backend/tcp/enable-messaging-protocol";

import * as async from "async";

import { getLogger } from "@cocalc/backend/logger";
const winston = getLogger("read-write-files");

import * as message from "@cocalc/util/message";
import { abspath, uuidsha1 } from "@cocalc/backend/misc_node";
const misc = require("@cocalc/util/misc");

const common = require("./common");
const ensureContainingDirectoryExists =
  require("@cocalc/backend/misc/ensure-containing-directory-exists").default;
const { writeFile } = require("fs/promises");

//##############################################
// Read and write individual files
//##############################################

// Read a file located in the given project.  This will result in an
// error if the readFile function fails, e.g., if the file doesn't
// exist or the project is not open.  We then send the resulting file
// over the socket as a blob message.
//
// Directories get sent as a ".tar.bz2" file.
// TODO: should support -- 'tar', 'tar.bz2', 'tar.gz', 'zip', '7z'. and mesg.archive option!!!
//
export function read_file_from_project(socket: CoCalcSocket, mesg) {
  //dbg = (m) -> winston.debug("read_file_from_project(path='#{mesg.path}'): #{m}")
  //dbg()
  let data: Buffer | undefined = undefined;
  let path = abspath(mesg.path);
  let is_dir: boolean | undefined = undefined;
  let id: string | undefined = undefined;
  let archive = undefined;
  let stats: Stats | undefined = undefined;

  return async.series(
    [
      //dbg("Determine whether the path '#{path}' is a directory or file.")
      (cb) =>
        stat(path, function (err, _stats) {
          if (err) {
            return cb(err);
          } else {
            stats = _stats;
            is_dir = stats.isDirectory();
            cb();
          }
        }),

      // make sure the file isn't too large
      function (cb) {
        if (stats == null) {
          cb("stats is null");
        } else {
          cb(common.check_file_size(stats.size));
        }
      },

      function (cb) {
        if (is_dir) {
          if (mesg.archive !== "tar.bz2") {
            cb("The only supported directory archive format is tar.bz2");
            return;
          }
          const target = temp.path({ suffix: "." + mesg.archive });
          //dbg("'#{path}' is a directory, so archive it to '#{target}', change path, and read that file")
          ({ archive } = mesg);
          if (path[path.length - 1] === "/") {
            // common nuisance with paths to directories
            path = path.slice(0, path.length - 1);
          }
          const split = misc.path_split(path);
          path = target;
          // same patterns also in project.coffee (TODO)
          const args = [
            "--exclude=.sagemathcloud*",
            "--exclude=.forever",
            "--exclude=.node*",
            "--exclude=.npm",
            "--exclude=.sage",
            "-jcf",
            target,
            split.tail,
          ];
          //dbg("tar #{args.join(' ')}")
          return execFile(
            "tar",
            args,
            { cwd: split.head },
            function (err, stdout, stderr) {
              if (err) {
                winston.debug(
                  `Issue creating tarball: ${err}, ${stdout}, ${stderr}`
                );
                return cb(err);
              } else {
                return cb();
              }
            }
          );
        } else {
          //dbg("It is a file.")
          return cb();
        }
      },

      //dbg("Read the file into memory.")
      (cb) =>
        readFile(path, function (err, _data) {
          data = _data;
          cb(err);
        }),

      function (cb) {
        if (data == null) return cb("data is null");

        id = uuidsha1(data.toString());
        //dbg("sha1 hash = '#{id}'")
        cb();
      },

      function (cb) {
        //dbg("send the file as a blob back to the hub.")
        socket.write_mesg(
          "json",
          message.file_read_from_project({
            id: mesg.id,
            data_uuid: id,
            archive,
          })
        );
        socket.write_mesg("blob", {
          uuid: id,
          blob: data,
          ttlSeconds: mesg.ttlSeconds, // TODO does ttlSeconds work?
        });
        return cb();
      },
    ],
    function (err) {
      if (err && err !== "file already known") {
        socket.write_mesg("json", message.error({ id: mesg.id, error: err }));
      }
      if (is_dir) {
        return exists(path, function (exists) {
          if (exists) {
            //dbg("It was a directory, so remove the temporary archive '#{path}'.")
            return unlink(path, () => {});
          }
        });
      }
    }
  );
}

exports.write_file_to_project = function (socket: CoCalcSocket, mesg) {
  //dbg = (m) -> winston.debug("write_file_to_project(path='#{mesg.path}'): #{m}")
  //dbg()

  const { data_uuid } = mesg;
  const path = abspath(mesg.path);

  // Listen for the blob containing the actual content that we will write.
  var write_file = async function (type, value) {
    if (type === "blob" && value.uuid === data_uuid) {
      socket.removeListener("mesg", write_file);
      try {
        await ensureContainingDirectoryExists(path);
        await writeFile(path, value.blob);
        return socket.write_mesg(
          "json",
          message.file_written_to_project({ id: mesg.id })
        );
      } catch (err) {
        return socket.write_mesg(
          "json",
          message.error({ id: mesg.id, error: err })
        );
      }
    }
  };
  return socket.on("mesg", write_file);
};
