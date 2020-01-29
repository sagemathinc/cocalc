import { encode_path } from "smc-util/misc";

import { client_db } from "smc-util/schema";

export function share_id(project_id: string, path: string): string {
  return client_db.sha1(project_id, path); // Consistent with smc-util/db-schema...
}

export function public_share_url(
  project_id: string,
  path: string,
  isdir: boolean = false,
  file_path?: string
): string {
  const base = share_server_url();
  const encoded_path = encode_path(file_path != null ? file_path : path);
  let display_url = `${base}${share_id(project_id, path)}/${encoded_path}${
    isdir ? "/" : ""
  }?viewer=share`;
  return display_url;
}

export function share_server_url(): string {
  let url: string = document.URL;
  url = url.slice(0, url.indexOf("/projects/"));
  return `${url}/share/`;
}
