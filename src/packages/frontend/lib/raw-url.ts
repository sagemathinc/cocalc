/*
The raw URL is the following, of course encoded as a URL:

.../{project_id}/files/{full relative path in the project to file}?compute_server_id=[global id number]
*/

import { join } from "path";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

interface Options {
  project_id: string;
  path: string;
  compute_server_id?: number;
}

export default function rawURL({
  project_id,
  path,
  compute_server_id,
}: Options): string {
  let url = join(appBasePath, project_id, "files", encodePath(path));
  if (compute_server_id) {
    url += `?id=${compute_server_id}`;
  }
  return url;
}

export function encodePath(path: string) {
  const segments = path.split("/");
  const encoded: string[] = [];
  for (const segment of segments) {
    encoded.push(encodeURIComponent(segment));
  }
  return encoded.join("/");
}
