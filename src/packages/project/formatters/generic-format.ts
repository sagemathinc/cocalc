/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { writeFile, readFile, unlink } from "fs";
import { file } from "tmp";
import { once } from "@cocalc/util/async-utils";
import { callback } from "awaiting";
import { spawn } from "child_process";

interface Options {
  command: string;
  args: (inputPath) => string[];
  input: string;
  timeout_s?: number; // default of 30 seconds
}

export default async function genericFormat({
  command,
  args,
  input,
  timeout_s,
}: Options): Promise<string> {
  // create input temp file
  const inputPath: string = await callback(file);
  try {
    await callback(writeFile, inputPath, input);

    // spawn the formatter
    const child = spawn(command, args(inputPath));

    // output stream capture:
    let stdout: string = "";
    let stderr: string = "";
    child.stdout.on("data", (data) => (stdout += data.toString("utf-8")));
    child.stderr.on("data", (data) => (stderr += data.toString("utf-8")));
    // wait for subprocess to close.
    const code = await once(child, "close", (timeout_s ?? 30) * 1000);
    if (code[0]) throw Error(stderr);
    // all fine, we read from the temp file:
    return (await callback(readFile, inputPath)).toString("utf-8");
  } finally {
    await callback(unlink, inputPath);
  }
}
