import { path_split, separate_file_extension } from "smc-util/misc2";
import { exec, raw_url_of_file } from "../../generic/client";

export async function revealjs_slideshow_html(
  project_id: string,
  path: string
): Promise<string> {
  const split = path_split(path);
  const base = "." + separate_file_extension(split.tail).name;
  const command = "/usr/local/bin/jupyter";
  const args = ["nbconvert", "--to", "slides", path, "--output", base];
  const opts = {
    command,
    args,
    project_id
  };
  await exec(opts);
  const html_filename = [split.head, base + ".html"].join("/");
  return raw_url_of_file(project_id, html_filename);
}
