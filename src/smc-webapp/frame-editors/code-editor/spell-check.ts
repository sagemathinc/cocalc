/*
Backend spell checking support
*/

import { filename_extension } from "../generic/misc";
import { exec, ExecOutput } from "../generic/client";

const misc_page = require("smc-webapp/misc_page");

interface Options {
  project_id: string;
  path: string;
  lang?: string;
  time?: number;
}

export async function misspelled_words(opts: Options): Promise<string[]> {
  if (!opts.lang) {
    opts.lang = misc_page.language();
  }
  if (opts.lang === "disable") {
    return [];
  }

  let mode: string;
  switch (filename_extension(opts.path)) {
    case "html":
      mode = "html";
      break;
    case "tex":
      mode = "tex";
      break;
    default:
      mode = "none";
  }
  const command = `cat '${opts.path}'|aspell --mode=${mode} --lang=${
    opts.lang
  } list|sort|uniq`;

  const output: ExecOutput = await exec({
    project_id: opts.project_id,
    command,
    bash: true,
    err_on_exit: true,
    allow_post: true,
    aggregate: opts.time
  });

  if (output.stderr) {
    throw Error(output.stderr);
  }

  return output.stdout.slice(0, output.stdout.length - 1).split("\n"); // have to slice final \n
}
