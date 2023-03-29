/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// BUG:
//
//  - this code is buggy since the SearchInput component below is NOT controlled,
//    but some of the code assumes it is, which makes no sense.
//    E.g., there is a clear_search prop that is passed in, which is
//    nonsense, because the state of the search is local to the
//    SearchInput. That's why the calls to clear
//    the search in all the code below are all broken.
//

import { useCallback, useMemo } from "react";
import { SearchInput } from "@cocalc/frontend/components";
import { Space } from "antd";
import * as immutable from "immutable";
import { COLORS } from "@cocalc/util/theme";
import { SEARCH_STYLE } from "./consts";
import { MultipleAddSearch } from "./multiple-add-search";

interface FoldersToolbarProps {
  search?: string;
  search_change: (search_value: string) => void; // search_change(current_search_value)
  num_omitted?: number;
  project_id: string;
  items: immutable.Map<string, any>;
  add_folders: (folders: string[]) => void; // add_folders (Iterable<T>)
  item_name: string;
  plural_item_name: string;
}

export const FoldersToolbar: React.FC<FoldersToolbarProps> = (
  props: FoldersToolbarProps
) => {
  const {
    search_change,
    num_omitted,
    items,
    add_folders,
    search: propsSearch,
    item_name = "item",
    plural_item_name = "item",
  } = props;

  function submit_selected(path_list) {
    if (path_list != null) {
      // If nothing is selected and the user clicks the button to "Add handout (etc)" then
      // path_list is undefined, hence don't do
      // (NOTE: I'm also going to make it so that button is disabled, which fits our
      // UI guidelines, so there's two reasons that path_list is defined here.)
      add_folders(path_list);
    }
  }

  // Omit any -collect directory (unless explicitly searched for).
  // Omit any currently assigned directory or subdirectories.
  const pathsToOmit = useMemo(() => {
    const omit: Set<string> = new Set([]);
    items
      .filter((val) => !val.get("deleted"))
      .map((val) => {
        const path = val.get("path");
        if (path != null) {
          // path might not be set in case something went wrong
          // (this has been hit in production)
          omit.add(path);
        }
      });
    return omit;
  }, [items]);

  const isExcluded = useCallback(
    (path) => {
      if (!path) return true;
      if (path.includes("-collect")) return true;
      if (pathsToOmit.has(path)) {
        return true;
      }
      // finally check if path is contained in any ommited path.
      for (const omit of pathsToOmit) {
        if (path.startsWith(omit + "/")) return true;
        if (omit.startsWith(path + "/")) return true;
      }

      return false;
    },
    [pathsToOmit]
  );

  return (
    <Space>
      <SearchInput
        placeholder={`Find ${plural_item_name}...`}
        default_value={propsSearch}
        on_change={search_change}
        style={SEARCH_STYLE}
      />
      {num_omitted ? (
        <h5
          style={{
            textAlign: "center",
            color: COLORS.GRAY_L,
            marginTop: "5px",
          }}
        >
          (Omitting {num_omitted}{" "}
          {num_omitted > 1 ? plural_item_name : item_name})
        </h5>
      ) : undefined}
      <MultipleAddSearch
        isExcluded={isExcluded}
        addSelected={submit_selected}
        itemName={item_name}
      />
    </Space>
  );
};
