/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useMemo, useState, useTypedRedux } from "../../app-framework";
import compute_file_masks from "@cocalc/frontend/project/explorer/compute_file_masks";
import compute_public_files from "@cocalc/frontend/project/explorer/compute_public_files";
import { FileEntry } from "./types";

export default function useListingsData({ project_id, useEditor, showHidden }) {
  const directory_listings = useTypedRedux(
    { project_id },
    "directory_listings"
  );

  const strippedPublicPaths = useTypedRedux(
    { project_id },
    "stripped_public_paths"
  );

  const dir = useEditor("dir");

  const [data, setData] = useState<FileEntry[] | null>(null);

  function extractFileData(): FileEntry[] {
    const listing = directory_listings?.get(dir);

    if (typeof listing === "string") {
      // TODO error
    }

    if (listing == null) return [];

    const listingFiltered = listing.filter(
      (file) => showHidden || !file.get("name")?.startsWith(".")
    );

    const listingJS = listingFiltered.toJS();
    compute_file_masks(listingJS);

    const map = {};
    for (const x of listing) {
      map[x.name] = x;
    }

    const x = {
      listing,
      public: {},
      path: "", // current_path
      file_map: map,
    };

    compute_public_files(
      x,
      strippedPublicPaths,
      "" // current_path
    );

    return (
      listingJS
        .map((file) => {
          const name = file.get("name");
          return {
            key: name,
            name: name,
            nameLC: name.toLowerCase(),
            size: file.get("size"),
            time: 1000 * file.get("mtime"), // convert to ms, for new Date() etc.
          };
        })
        .toJS() ?? []
    );
  }

  useMemo(() => {
    if (dir == null) return null;
    const data = extractFileData();
    setData(data);
  }, [directory_listings, dir, showHidden]);

  return data;
}
