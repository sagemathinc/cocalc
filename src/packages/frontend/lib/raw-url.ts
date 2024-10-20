/*
The raw URL is the following, of course encoded as a URL:

.../{project_id}/raw/{full relative path in the project to file}

On a compute server though the project_id is not redundant (there is only one project),
so not in the URL.
*/

import { join } from "path";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { encode_path } from "@cocalc/util/misc";

interface Options {
  project_id: string;
  path: string;
}

export default function rawURL({ project_id, path }: Options): string {
  // we have to encode the path, since we query this raw server. see
  // https://github.com/sagemathinc/cocalc/issues/5542
  // but actually, this is a problem for types of files, not just PDF
  const path_enc = encode_path(path);
  return join(appBasePath, project_id, "raw", path_enc);
}
