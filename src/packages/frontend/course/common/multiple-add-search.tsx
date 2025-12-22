/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";
import { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { Icon } from "@cocalc/frontend/components";
import { course } from "@cocalc/frontend/i18n";
import DirectorySelector from "@cocalc/frontend/project/directory-selector";
import { capitalize, plural } from "@cocalc/util/misc";
import { ItemName } from "./types";

interface MultipleAddSearchProps {
  addSelected: (keys: string[]) => void; // Submit user selected results add_selected(['paths', 'of', 'folders'])
  itemName: ItemName;
  err?: string;
  isExcluded: (path: string) => boolean;
  defaultOpen?;
  selectorStyle?;
  closable: boolean;
}

// Multiple result selector
// use on_change and search to control the search bar.
// Coupled with Assignments Panel and Handouts Panel
export function MultipleAddSearch({
  addSelected,
  itemName = "assignment",
  isExcluded,
  defaultOpen,
  selectorStyle,
  closable,
}: MultipleAddSearchProps) {
  const intl = useIntl();
  const [selecting, setSelecting] = useState<boolean>(defaultOpen);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set([]));
  const n = selectedItems.size;

  function clear() {
    setSelecting(false);
    setSelectedItems(new Set([]));
  }

  function label(): string {
    switch (itemName) {
      case "assignment":
        return intl.formatMessage(course.assignment);
      case "handout":
        return intl.formatMessage(course.handout);
      default:
        return itemName;
    }
  }

  function labelPlural(): string {
    if (n === 1) return label();
    switch (itemName) {
      case "assignment":
        return intl.formatMessage(course.assignments);
      case "handout":
        return intl.formatMessage(course.handouts);
      default:
        return plural(n, label());
    }
  }

  const title = intl.formatMessage(
    {
      id: "course.multiple-add-search.directory-selector.title",
      defaultMessage: `Select one or more {name} folders`,
    },
    { name: label() },
  );

  return (
    <div>
      <Button
        style={{ marginRight: "5px" }}
        disabled={selecting}
        onClick={() => setSelecting(true)}
      >
        <FormattedMessage
          id="course.multiple-add-search.directory-selector.button"
          defaultMessage={`Add {name}...`}
          values={{ name: capitalize(label()) }}
        />
      </Button>
      {selecting && (
        <DirectorySelector
          multi
          closable={closable}
          style={{
            width: "500px",
            margin: "10px 0",
            position: "absolute",
            zIndex: 1000,
            boxShadow: "8px 8px 4px #888",
            ...selectorStyle,
          }}
          title={title}
          onMultiSelect={setSelectedItems}
          onClose={clear}
          isExcluded={(path) => {
            for (const cur of selectedItems) {
              if (path.startsWith(cur + "/")) return true;
              if (cur.startsWith(path + "/")) return true;
            }
            return isExcluded(path);
          }}
        />
      )}
      {selecting && (
        <Button
          type="primary"
          disabled={n == 0}
          onClick={() => {
            addSelected(Array.from(selectedItems));
            clear();
          }}
        >
          <Icon name="plus" />
          <FormattedMessage
            id="course.multiple-add-search.directory-selector.add_button"
            defaultMessage={`{n, select,
              0 {Select one or more directories}
              other {Add {n} {name}}}`}
            values={{
              n,
              name: labelPlural(),
            }}
          />
        </Button>
      )}
    </div>
  );
}
