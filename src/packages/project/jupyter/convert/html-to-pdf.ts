/*
Note that this doesn't actually use upstream nbconvert itself at all!

- pdf:  takes html, then uses headless chrome via
  chromium-browser or google-chrome, if installed to convert to pdf

NOTE: Firefox does *not* support printing to pdf in headless mode according to
https://stackoverflow.com/questions/48358556/firefox-headless-print-to-pdf-option
*/

import which from "which";
import { join, parse } from "path";

// time google-chrome --headless --disable-gpu --no-sandbox --print-to-pdf=a.pdf --run-all-compositor-stages-before-draw --virtual-time-budget=10000 a.html
const { execute_code } = require("@cocalc/backend/misc_node");
import { callback_opts } from "@cocalc/util/async-utils";

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
    "--print-to-pdf",
    outfile,
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget",
    `${timeout * 1000}`,
    path,
  ];
  const output = await callback_opts(execute_code)({
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
