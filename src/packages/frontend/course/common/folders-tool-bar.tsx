/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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

export function FoldersToolbar({
  search_change,
  num_omitted,
  items,
  add_folders,
  search: propsSearch,
  item_name = "item",
  plural_item_name = "item",
}: FoldersToolbarProps) {
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
      <AddItems addItems={add_folders} itemName={item_name} items={items} />
    </Space>
  );
}

export function AddItems({
  addItems,
  itemName,
  items,
  defaultOpen,
  selectorStyle,
  closable = true,
}: {
  addItems;
  itemName: string;
  items;
  defaultOpen?;
  selectorStyle?;
  closable?;
}) {
  // Omits any -collect directory (unless explicitly searched for).
  // Omits any currently assigned directory or subdirectories.
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
      if (path.includes("-collect")) {
        return true;
      }
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
    [pathsToOmit],
  );

  return (
    <MultipleAddSearch
      isExcluded={isExcluded}
      addSelected={(paths) => {
        if (paths != null) {
          addItems(paths);
        }
      }}
      itemName={itemName}
      defaultOpen={defaultOpen}
      selectorStyle={selectorStyle}
      closable={closable}
    />
  );
}
