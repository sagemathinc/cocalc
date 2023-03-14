/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useState } from "react";
import { Button } from "antd";
import { Icon } from "@cocalc/frontend/components";
import DirectorySelector from "@cocalc/frontend/project/directory-selector";
import { capitalize, plural } from "@cocalc/util/misc";

interface MultipleAddSearchProps {
  addSelected: (keys: string[]) => void; // Submit user selected results add_selected(['paths', 'of', 'folders'])
  itemName: string;
  err?: string;
}

// Multiple result selector
// use on_change and search to control the search bar.
// Coupled with Assignments Panel and Handouts Panel
export function MultipleAddSearch({
  addSelected,
  itemName = "result",
}: MultipleAddSearchProps) {
  const [selecting, setSelecting] = useState<boolean>(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set([]));

  function clear() {
    setSelecting(false);
    setSelectedItems(new Set([]));
  }

  return (
    <div>
      <Button
        style={{ marginRight: "5px" }}
        disabled={selecting}
        onClick={() => setSelecting(true)}
      >
        Add {capitalize(itemName)}...
      </Button>
      {selecting && (
        <DirectorySelector
          multi
          style={{
            width: "500px",
            margin: "10px 0",
            position: "absolute",
            zIndex: 1,
            boxShadow: "8px 8px 4px #888",
          }}
          title={`Select one or more ${itemName} directories`}
          onMultiSelect={setSelectedItems}
          onClose={clear}
        />
      )}
      {selecting && (
        <Button
          type="primary"
          disabled={selectedItems.size == 0}
          onClick={() => {
            addSelected(Array.from(selectedItems));
            clear();
          }}
        >
          <Icon name="plus" />
          {selectedItems.size == 0
            ? "Select one or more directories"
            : `Add ${selectedItems.size} ${plural(
                selectedItems.size,
                capitalize(itemName)
              )}`}
        </Button>
      )}
    </div>
  );
}
