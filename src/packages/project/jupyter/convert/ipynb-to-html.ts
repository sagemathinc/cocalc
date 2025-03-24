/*
Some React-based nbconvert functionality.

Note that this doesn't actually use upstream nbconvert itself at all!

 - html: using react; very fast and uses no command line calls; html
   has references in it to content on a cdn.
*/

import * as fs from "fs";
import { join, parse } from "path";

const { readFile, writeFile } = fs.promises;

export default async function ipynbToHtml(path: string): Promise<string> {
  // This toHtml is expensive to import (due to the frontend being quite large),
  // so we don't import it at the module level:
  const { default: toHtml } = await import(
    "@cocalc/frontend/jupyter/nbviewer/export"
  );

  const content = (await readFile(path)).toString();
  const html = toHtml({ content, style: { margin: "30px 30px 0 0" } });
  const outfile = htmlPath(path);
  await writeFile(outfile, html);
  return outfile;
}

export function htmlPath(path: string): string {
  const { dir, name } = parse(path);
  return join(dir, name + ".html");
}
