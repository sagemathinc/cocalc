import { encode_path } from "smc-util/misc";

export function construct_public_share_url(
  project_id: string,
  path: string,
  isdir: boolean = false
): string {
  let url: string = document.URL;
  url = url.slice(0, url.indexOf("/projects/"));
  let display_url = `${url}/share/${project_id}/${encode_path(
    path
  )}?viewer=share`;
  if (isdir) {
    display_url += "/";
  }
  return display_url;
}
