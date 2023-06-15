/*
Note that this doesn't actually use upstream nbconvert itself at all!

- pdf:  takes html, then uses headless chrome via
  chromium-browser or google-chrome, if installed to convert to pdf

NOTE: Firefox does *not* support printing to pdf in headless mode according to
https://stackoverflow.com/questions/48358556/firefox-headless-print-to-pdf-option
*/

import which from "which";
import { join, parse } from "path";
import { executeCode } from "@cocalc/backend/execute-code";
import { getLogger } from "@cocalc/project/logger";

const log = getLogger("jupyter:html-to-pdf");

// time google-chrome --headless --disable-gpu --no-sandbox --print-to-pdf=a.pdf --run-all-compositor-stages-before-draw --virtual-time-budget=10000 --disable-dev-shm-usage --disable-setuid-sandbox a.html

export default async function htmlToPDF(
  path: string,
  timeout: number = 30
): Promise<string> {
  const { dir, name } = parse(path);
  const outfile = join(dir, name + ".pdf");

  const command = await getCommand();
  const args = [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    `--print-to-pdf=${outfile}`,
    "--run-all-compositor-stages-before-draw",
    // I added --disable-dev-shm-usage --disable-setuid-sandbox because printing large complicated documents was failing,
    // and GPT-4 suggested these options.  There are security implications, but that is OK given the application.
    "--disable-dev-shm-usage",
    "--disable-setuid-sandbox",
    `--virtual-time-budget=${timeout * 1000}`,
    path,
  ];
  log.debug(`htmlToPDF: ${command} ${args.join(" ")}`);
  const output = await executeCode({
    command,
    args,
    err_on_exit: false,
    timeout,
    ulimit_timeout: true,
    bash: true,
  });
  if (output.exit_code != 0) {
    throw Error(output.stderr);
  }

  return outfile;
}

const COMMANDS = ["google-chrome", "chromium-browser"];

let cache: string = "";
async function getCommand(): Promise<string> {
  if (cache) return cache;
  for (const cmd of COMMANDS) {
    try {
      await which(cmd);
      cache = cmd;
      return cmd;
    } catch (_err) {}
  }
  throw Error(
    `one of ${COMMANDS.join(" or ")} must be installed to convert to PDF`
  );
}
