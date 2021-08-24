/*
The raw URL is the following, of course encoded as a URL:

.../{project_id}/raw/{full relative path in the project to file}
*/

import { join } from "path";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

interface Options {
  project_id: string;
  path: string;
}

export default function rawURL({ project_id, path }: Options): string {
  return join(appBasePath, project_id, "raw", encodePath(path));
}

export function encodePath(path: string) {
  const segments = path.split("/");
  const encoded: string[] = [];
  for (const segment of segments) {
    encoded.push(encodeURIComponent(segment));
  }
  return encoded.join("/");
}
