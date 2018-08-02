/*
Backend spell checking support
*/

import { filename_extension } from "../generic/misc";
import { exec, ExecOutput } from "../generic/client";
import { language } from "../generic/misc-page";

interface Options {
  project_id: string;
  path: string;
  lang: string;
  time?: number;
}

export async function misspelled_words(opts: Options): Promise<string[]> {
  if (!opts.lang) {
    opts.lang = language();
  }
  if (opts.lang === "disabled") {
    return [];
  }

  let mode: string;
  switch (filename_extension(opts.path).toLowerCase()) {
    case "html":
      mode = "--mode=html";
      break;
    case "tex":
    case "rtex":
    case "rnw":
      mode = "--mode=tex";
      break;
    default:
      mode = "--mode=none";
  }
  let lang;
  switch(opts.lang) {
    case 'default':
      lang = `--lang=${language()}`;
      break;
    case 'disabled':
      lang = '';
      break;
    default:
      lang = `--lang=${opts.lang}`;

  }
  const command = `cat '${opts.path}'|aspell ${mode} ${lang} list|sort|uniq`;
  //console.log(command);

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
