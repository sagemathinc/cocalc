/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as misc from "@cocalc/util/misc";
import { FileData } from "@cocalc/frontend/project_store";

// Mutates data to include info on public paths.
export default function compute_public_files(
  data: FileData,
  public_paths, // project_store.get("stripped_public_paths")
  current_path // project_store.this.get("current_path")
) {
  const { listing } = data;
  const pub = data.public;
  if (public_paths != null && public_paths.size > 0) {
    const head = current_path ? current_path + "/" : "";
    const paths: string[] = [];
    const public_path_data = {};
    for (var x of public_paths.toJS()) {
      public_path_data[x.path] = x;
      paths.push(x.path);
    }
    for (x of listing) {
      const full = head + x.name;
      const p = misc.containing_public_path(full, paths);
      if (p != null) {
        x.public = public_path_data[p];
        x.is_public = !x.public.disabled;
        pub[x.name] = public_path_data[p];
      }
    }
  }
}
