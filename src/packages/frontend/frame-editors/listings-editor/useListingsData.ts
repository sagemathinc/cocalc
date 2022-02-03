/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useMemo, useState, useTypedRedux } from "../../app-framework";
import { FileEntry } from "./types";

export default function useListingsData({ project_id, useEditor, showHidden }) {
  const directory_listings = useTypedRedux(
    { project_id },
    "directory_listings"
  );

  const dir = useEditor("dir");

  const [data, setData] = useState<FileEntry[] | null>(null);

  function extractFileData(): FileEntry[] {
    return (
      directory_listings
        ?.get(dir)
        ?.filter((file) => showHidden || !file.get("name")?.startsWith("."))
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
