/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Export collected homework assignments in a format that is easy to
use in an external tool that knows nothing about Sage worksheets
or Jupyter notebooks and with the directory structure removed.
In practice, this means that sagews and ipynb files are converted
to pdf, the special txt files indicated the student name are removed,
files in subdirectories are ignored, and filenames are prefixed with
the student name.
*/

import { endswith, len, startswith } from "@cocalc/util/misc";
import { exec, project_api } from "../../frame-editors/generic/client";
import { StudentsMap } from "../store";

export async function export_assignment(
  project_id: string,
  collect_path: string,
  export_path: string,
  students: StudentsMap,
  student_name: Function,
  log: Function, // call with a string giving the current thing being done.
): Promise<void> {
  log(`Ensure target path "${export_path}" exists`);
  await exec({ command: "mkdir", args: ["-p", export_path], project_id });
  const errors: { [name: string]: string } = {};

  // for each student, do the export
  let n: number = 1;
  for (const [student_id, student] of students) {
    const name = student_name(student_id);
    const desc = "Exporting " + name + ` (student ${n} of ${students.size}): `;
    n += 1;
    log(desc);
    if (student.get("deleted")) continue;
    try {
      await export_one_directory(
        project_id,
        collect_path + "/" + student_id,
        export_path,
        name,
        (s) => log(desc + s),
      );
    } catch (err) {
      errors[name] = `${err}`;
    }
  }

  log("Create zip archive of export directory");
  await exec({
    command: "zip",
    args: ["-r", export_path + ".zip", export_path],
    project_id,
  });

  if (len(errors) > 0) {
    throw Error(JSON.stringify(errors));
  }
}

async function export_one_directory(
  project_id: string,
  source: string,
  target: string,
  prefix: string,
  log: Function,
): Promise<void> {
  const api = await project_api(project_id);
  let listing;
  try {
    listing = await api.listing(source);
  } catch (err) {
    if (`${err}`.indexOf("ENOENT") != -1) {
      // ignore completely missing directories -- no problem.
      return;
    }
  }
  let x: any;
  const timeout = 60; // 60 seconds
  for (x of listing) {
    if (x.isDir) continue; // we ignore subdirectories...
    const { name } = x;
    if (startswith(name, "STUDENT")) continue;
    if (startswith(name, ".")) continue;
    log(name);
    if (endswith(name, ".ipynb")) {
      // convert, then move html and pdf
      const pdf = name.slice(0, name.length - "ipynb".length) + "pdf";
      const html = name.slice(0, name.length - "ipynb".length) + "html";
      try {
        try {
          // See packages/frontend/project/websocket/api.ts for jupyter_nbconvert:
          await api.jupyter_nbconvert({
            args: ["--to", "cocalc-pdf", name],
            directory: source,
            timeout,
          });
        } catch (err) {
          // even if this fails, html might have been created fine as part of the
          // conversion process.
          log(`WARNING: conversion to PDF may have failed ${err}`);
        }
        await exec({
          command: "mv",
          args: [source + "/" + html, target + "/" + prefix + "-" + html],
          project_id,
        });
        await exec({
          command: "mv",
          args: [source + "/" + pdf, target + "/" + prefix + "-" + pdf],
          project_id,
        });
      } catch (err) {
        log(`WARNING: Conversion ipynb to PDF failed. ${err}`);
      }
    } else if (endswith(name, ".sagews")) {
      try {
        // convert, then move pdf
        const pdf = name.slice(0, name.length - "sagews".length) + "pdf";
        await exec({
          command: "cc-sagews2pdf",
          args: [source + "/" + name],
          project_id,
          timeout,
        });
        await exec({
          command: "mv",
          args: [source + "/" + pdf, target + "/" + prefix + "-" + pdf],
          project_id,
        });
      } catch (err) {
        // Failed to convert sagews to pdf, so do nothing.
        log(`WARNING -- problem copying ${name} -- ${err}`);
      }
    }
    try {
      // Always copy original file over (failure is NON fatal)
      await exec({
        command: "cp",
        args: [source + "/" + name, target + "/" + prefix + "-" + name],
        project_id,
      });
    } catch (err) {
      log(`WARNING -- problem copying ${name} -- ${err}`);
    }
  }
}
