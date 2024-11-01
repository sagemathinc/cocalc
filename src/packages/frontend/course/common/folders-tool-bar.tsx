/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Input, Space } from "antd";
import type { Map as iMap } from "immutable";
import { useCallback, useMemo } from "react";

import { SEARCH_STYLE } from "./consts";
import { MultipleAddSearch } from "./multiple-add-search";
import { ItemName } from "./types";

interface FoldersToolbarProps {
  search?: string;
  search_change: (search_value: string) => void; // search_change(current_search_value)
  num_omitted?: number;
  project_id: string;
  items: iMap<string, any>;
  add_folders: (folders: string[]) => void; // add_folders (Iterable<T>)
  item_name: ItemName;
  plural_item_name: string;
}

export function FoldersToolbar({
  search_change,
  num_omitted,
  items,
  add_folders,
  search: propsSearch,
  item_name = "assignment",
  plural_item_name = "item",
}: FoldersToolbarProps) {
  return (
    <Space>
      <Input.Search
        allowClear
        placeholder={`Filter ${plural_item_name}...`}
        value={propsSearch}
        onChange={(e) => search_change(e.target.value)}
        style={SEARCH_STYLE}
      />
      {num_omitted ? (
        <h5
          style={{
            textAlign: "center",
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
  itemName: ItemName;
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
