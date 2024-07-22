/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
//########################################################################
// This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
// License: MS-RSL – see LICENSE.md for details
//########################################################################

import { CoCalcSocket } from "@cocalc/backend/tcp/enable-messaging-protocol";
import { execFile } from "node:child_process";
import { constants, Stats } from "node:fs";
import {
  access,
  readFile as readFileAsync,
  stat as statAsync,
  unlink,
  writeFile,
} from "node:fs/promises";
import * as temp from "temp";

import ensureContainingDirectoryExists from "@cocalc/backend/misc/ensure-containing-directory-exists";
import { abspath, uuidsha1 } from "@cocalc/backend/misc_node";
import * as message from "@cocalc/util/message";
import { path_split } from "@cocalc/util/misc";
import { check_file_size } from "./common";

import { getLogger } from "@cocalc/backend/logger";
const winston = getLogger("read-write-files");

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
export async function read_file_from_project(socket: CoCalcSocket, mesg) {
  const dbg = (...m) =>
    winston.debug(`read_file_from_project(path='${mesg.path}'): `, ...m);
  dbg("called");
  let data: Buffer | undefined = undefined;
  let path = abspath(mesg.path);
  let is_dir: boolean | undefined = undefined;
  let id: string | undefined = undefined;
  let target: string | undefined = undefined;
  let archive = undefined;
  let stats: Stats | undefined = undefined;

  try {
    //dbg("Determine whether the path '#{path}' is a directory or file.")
    stats = await statAsync(path);
    is_dir = stats.isDirectory();

    // make sure the file isn't too large
    const size_check = check_file_size(stats.size);
    if (size_check) {
      throw new Error(size_check);
    }

    // tar jcf a directory
    if (is_dir) {
      if (mesg.archive !== "tar.bz2") {
        throw new Error(
          "The only supported directory archive format is tar.bz2"
        );
      }
      target = temp.path({ suffix: "." + mesg.archive });
      //dbg("'#{path}' is a directory, so archive it to '#{target}', change path, and read that file")
      archive = mesg.archive;
      if (path[path.length - 1] === "/") {
        // common nuisance with paths to directories
        path = path.slice(0, path.length - 1);
      }
      const split = path_split(path);
      // TODO same patterns also in project.ts
      const args = [
        "--exclude=.sagemathcloud*",
        "--exclude=.forever",
        "--exclude=.node*",
        "--exclude=.npm",
        "--exclude=.sage",
        "-jcf",
        target as string,
        split.tail,
      ];
      //dbg("tar #{args.join(' ')}")
      await new Promise<void>((resolve, reject) => {
        execFile(
          "tar",
          args,
          { cwd: split.head },
          function (err, stdout, stderr) {
            if (err) {
              winston.debug(
                `Issue creating tarball: ${err}, ${stdout}, ${stderr}`
              );
              return reject(err);
            } else {
              return resolve();
            }
          }
        );
      });
    } else {
      //Nothing to do, it is a file.
      target = path;
    }
    if (!target) {
      throw Error("bug -- target must be set");
    }

    //dbg("Read the file into memory.")
    data = await readFileAsync(target);

    // get SHA1 of contents
    if (data == null) {
      throw new Error("data is null");
    }
    id = uuidsha1(data);
    //dbg("sha1 hash = '#{id}'")

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
  } catch (err) {
    if (err && err !== "file already known") {
      socket.write_mesg(
        "json",
        message.error({ id: mesg.id, error: `${err}` })
      );
    }
  }

  // in any case, clean up the temporary archive
  if (is_dir && target) {
    try {
      await access(target, constants.F_OK);
      //dbg("It was a directory, so remove the temporary archive '#{path}'.")
      await unlink(target);
    } catch (err) {
      winston.debug(`Error removing temporary archive '${target}': ${err}`);
    }
  }
}

export function write_file_to_project(socket: CoCalcSocket, mesg) {
  const dbg = (...m) =>
    winston.debug(`write_file_to_project(path='${mesg.path}'): `, ...m);
  dbg("called");

  const { data_uuid } = mesg;
  const path = abspath(mesg.path);

  // Listen for the blob containing the actual content that we will write.
  const write_file = async function (type, value) {
    if (type === "blob" && value.uuid === data_uuid) {
      socket.removeListener("mesg", write_file);
      try {
        await ensureContainingDirectoryExists(path);
        await writeFile(path, value.blob);
        socket.write_mesg(
          "json",
          message.file_written_to_project({ id: mesg.id })
        );
      } catch (err) {
        socket.write_mesg("json", message.error({ id: mesg.id, error: err }));
      }
    }
  };
  socket.on("mesg", write_file);
}
