/*
Some React-based nbconvert functionality.

Note that this doesn't actually use upstream nbconvert itself at all!

 - html: using react; very fast and uses no command line calls; html depends on cdn.
*/

import * as fs from "fs";
import { join, parse } from "path";
import toHtml from "@cocalc/frontend/jupyter/nbviewer/export";

const { readFile, writeFile } = fs.promises;

export default async function ipynbToHtml(path: string): Promise<string> {
  const content = (await readFile(path)).toString();
  const html = toHtml({ content, style: { margin: "30px 30px 0 0" } });
  const { dir, name } = parse(path);
  const outfile = join(dir, name + ".html");
  await writeFile(outfile, html);
  return outfile;
}
