/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

//##############################################
// Printing an individual file to pdf
//##############################################

import async from "async";
import { writeFile, unlink } from "node:fs";
import { path as temp_path } from "temp";

const misc = require("@cocalc/util/misc");
import { execute_code } from "@cocalc/backend/misc_node";
import * as message from "@cocalc/util/message";

const { defaults, required } = misc;

function print_sagews(opts) {
  opts = defaults(opts, {
    path: required,
    outfile: required,
    title: required,
    author: required,
    date: required,
    contents: required,
    subdir: required, // 'true' or 'false', if true, then workdir is a generated subdirectory which will retain the temporary tex files
    base_url: undefined, // the base_url for downloading blobs/images
    extra_data: undefined, // extra data that is useful for displaying certain things in the worksheet.
    timeout: 90,
    cb: required,
  });

  let extra_data_file: string | undefined = undefined;
  let args = [
    opts.path,
    "--outfile",
    opts.outfile,
    "--title",
    opts.title,
    "--author",
    opts.author,
    "--date",
    opts.date,
    "--subdir",
    opts.subdir,
    "--contents",
    opts.contents,
  ];
  if (opts.base_url) {
    args = args.concat(["--base_url", opts.base_url]);
  }

  return async.series(
    [
      function (cb) {
        if (opts.extra_data == null) {
          cb();
          return;
        }
        extra_data_file = temp_path() + ".json";
        args.push("--extra_data_file");
        args.push(extra_data_file);
        // NOTE: extra_data is a string that is *already* in JSON format.
        return writeFile(extra_data_file, opts.extra_data, cb);
      },
      // run the converter script
      (cb) =>
        execute_code({
          command: "smc-sagews2pdf",
          args,
          err_on_exit: true,
          bash: false,
          timeout: opts.timeout,
          cb,
        }),
    ],
    (err) => {
      if (extra_data_file != null) {
        unlink(extra_data_file, () => {}); // no need to wait for completion before calling opts.cb
      }
      return opts.cb(err);
    }
  );
}

export function print_to_pdf(socket, mesg) {
  let pdf;
  const ext = misc.filename_extension(mesg.path);
  if (ext) {
    pdf = `${mesg.path.slice(0, mesg.path.length - ext.length)}pdf`;
  } else {
    pdf = mesg.path + ".pdf";
  }

  return async.series(
    [
      function (cb) {
        switch (ext) {
          case "sagews":
            return print_sagews({
              path: mesg.path,
              outfile: pdf,
              title: mesg.options.title,
              author: mesg.options.author,
              date: mesg.options.date,
              contents: mesg.options.contents,
              subdir: mesg.options.subdir,
              extra_data: mesg.options.extra_data,
              timeout: mesg.options.timeout,
              cb,
            });
          default:
            return cb(`unable to print file of type '${ext}'`);
        }
      },
    ],
    function (err) {
      if (err) {
        return socket.write_mesg(
          "json",
          message.error({ id: mesg.id, error: err })
        );
      } else {
        return socket.write_mesg(
          "json",
          message.printed_to_pdf({ id: mesg.id, path: pdf })
        );
      }
    }
  );
}
