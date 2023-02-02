/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

//##############################################
// Printing an individual file to pdf
//##############################################

import { unlink, writeFile } from "node:fs/promises";
import { path as temp_path } from "temp";

import { execute_code } from "@cocalc/backend/misc_node";
import { CoCalcSocket } from "@cocalc/backend/tcp/enable-messaging-protocol";
import * as message from "@cocalc/util/message";
import { defaults, filename_extension, required } from "@cocalc/util/misc";

import { getLogger } from "@cocalc/backend/logger";
const winston = getLogger("print-to-pdf");

interface SagewsPrintOpts {
  path: string;
  outfile: string;
  title: string;
  author: string;
  date: string;
  contents: string;
  subdir: string;
  base_url?: string;
  extra_data?: string;
  timeout?: number;
}

async function print_sagews(opts: SagewsPrintOpts) {
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

  let err: Error | undefined = undefined;

  try {
    if (opts.extra_data != null) {
      extra_data_file = temp_path() + ".json";
      args.push("--extra_data_file");
      args.push(extra_data_file);
      // NOTE: extra_data is a string that is *already* in JSON format.
      await writeFile(extra_data_file, opts.extra_data);
    }

    // run the converter script
    await new Promise<void>((resolve, reject) => {
      execute_code({
        command: "smc-sagews2pdf",
        args,
        err_on_exit: true,
        bash: false,
        timeout: opts.timeout,
        cb: (err) => {
          if (err) {
            winston.debug(`Issue running smc-sagews2pdf: ${err}`);
            reject(err);
          } else {
            resolve();
          }
        },
      });
    });
  } catch (err) {
    err = err;
  }

  if (extra_data_file != null) {
    unlink(extra_data_file); // no need to wait for completion before calling opts.cb
  }

  if (err) {
    throw err;
  }
}

export async function print_to_pdf(socket: CoCalcSocket, mesg) {
  let pdf;
  const ext = filename_extension(mesg.path);
  if (ext) {
    pdf = `${mesg.path.slice(0, mesg.path.length - ext.length)}pdf`;
  } else {
    pdf = mesg.path + ".pdf";
  }

  try {
    switch (ext) {
      case "sagews":
        await print_sagews({
          path: mesg.path,
          outfile: pdf,
          title: mesg.options.title,
          author: mesg.options.author,
          date: mesg.options.date,
          contents: mesg.options.contents,
          subdir: mesg.options.subdir,
          extra_data: mesg.options.extra_data,
          timeout: mesg.options.timeout,
        });
        break;

      default:
        throw new Error(`unable to print file of type '${ext}'`);
    }

    // all good
    return socket.write_mesg(
      "json",
      message.printed_to_pdf({ id: mesg.id, path: pdf })
    );
  } catch (err) {
    return socket.write_mesg(
      "json",
      message.error({ id: mesg.id, error: err })
    );
  }
}
