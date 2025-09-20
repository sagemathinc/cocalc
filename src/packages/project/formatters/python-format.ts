/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { writeFile, readFile, unlink } from "fs";
import { file } from "tmp";
import { callback } from "awaiting";
import { spawn } from "child_process";
import which from "which";

interface ParserOptions {
  parser?: string;
  tabWidth?: number;
  useTabs?: boolean;
  util?: string;
}

function close(proc, cb): void {
  proc.on("close", (code) => cb(undefined, code));
}

async function getPath(v: string[]): Promise<string> {
  for (const path of v) {
    try {
      return await which(path);
    } catch {}
  }
  throw Error(`one of ${v.join(" ")} must be installed`);
}

// Switch to ruff -- it claims to be 100x faster than all the others and has many other
// more advanced features (like LSP).
let yapfPath: string | undefined = undefined;
async function yapf(input_path) {
  // it's yapf on some Ubuntu versions and yapf3 on newer ones
  yapfPath ??= await getPath(["yapf", "yapf3"]);
  return spawn(yapfPath!, ["-i", input_path]);
}

export async function python_format(
  input: string,
  options: ParserOptions,
  logger: any,
): Promise<string> {
  // create input temp file
  const input_path: string = await callback(file);
  try {
    await callback(writeFile, input_path, input);

    // spawn the python formatter
    const util = options.util || "yapf";

    if (util !== "yapf") {
      throw new Error(
        "This project only supports 'yapf' for formatting Python",
      );
    }

    const py_formatter = await yapf(input_path);

    py_formatter.on("error", (err) => {
      // ATTN do not throw an error here, because this is triggered by the subprocess!
      logger.debug(
        `Formatting utility exited with error no ${(err as any).errno}`,
      );
    });

    // stdout/err capture
    let stdout: string = "";
    let stderr: string = "";
    // read data as it is produced.
    py_formatter.stdout.on("data", (data) => (stdout += data.toString()));
    py_formatter.stderr.on("data", (data) => (stderr += data.toString()));
    // wait for subprocess to close.
    const code = await callback(close, py_formatter);
    // only last line
    // stdout = last_line(stdout);
    if (code) {
      if (code === -2) {
        // ENOENT
        throw new Error(`Formatting utility "${util}" is not installed`);
      }
      const err_msg = `Python formatter "${util}" exited with code ${code}:${
        stdout.trim() ? "\n" + stdout.trim() : ""
      }\n${stderr.trim()}\n${addContext(input, stderr)}'`;
      logger.debug(`format python error: ${err_msg}`);
      throw new Error(err_msg);
    }

    // all fine, we read from the temp file
    const output: Buffer = await callback(readFile, input_path);
    const s: string = output.toString("utf-8");
    return s;
  } finally {
    unlink(input_path, () => {});
  }
}

// This is designed to look like the context output by prettier.
export function addContext(input: string, stderr: string): string {
  // the format of an error is
  //   yapf: a.py:2:27: EOL while scanning string literal
  // and there is ABSOLUTELY NO WAY to get yapf to provide any context
  // around the error.  So we add it right here.

  // Given that stderr looks like 'yapf: /tmp/tmp-35898eBshJwli6pIM.tmp:2:27: EOL while scanning string literal'
  // figure out the line number (2 in this case), etc.

  const pattern = /:([\d]+):/;
  const match = stderr.match(pattern);
  if (match != null && match?.[1] != null) {
    const lineNum = parseInt(match?.[1] ?? "0");

    // split input into lines so we can extract the relevant line
    const lines = input.split("\n");
    let n = Math.max(0, lineNum - 3);
    const line = () => {
      n += 1;
      return n;
    };

    const before = lines
      .slice(Math.max(0, lineNum - 3), lineNum - 1)
      .map((x) => `  ${line()} | ${x}`)
      .join("\n");
    const at = `> ${line()} | ${lines[lineNum - 1]}`;
    const after = lines
      .slice(lineNum, lineNum + 2)
      .map((x) => `  ${line()} | ${x}`)
      .join("\n");

    return `Error occurred at line ${lineNum}:

${before}
${at}
${after}`;
  }
  return "";
}
