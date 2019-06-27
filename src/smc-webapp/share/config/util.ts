import { encode_path } from "smc-util/misc";

export function public_share_url(
  project_id: string,
  path: string,
  isdir: boolean = false
): string {
  const base = share_server_url();
  let display_url = `${base}/${project_id}/${encode_path(path)}?viewer=share`;
  if (isdir) {
    display_url += "/";
  }
  return display_url;
}

export function share_server_url(): string {
  let url: string = document.URL;
  url = url.slice(0, url.indexOf("/projects/"));
  return `${url}/share/`;
}
