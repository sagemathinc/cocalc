/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
The tag editing toolbar functionality for cells.
*/

import { Button, Input } from "antd";
import { useState } from "@cocalc/frontend/app-framework";
import { Map as ImmutableMap } from "immutable";
import { Icon } from "@cocalc/frontend/components";
import { keys, split } from "@cocalc/util/misc";
import { JupyterActions } from "./browser-actions";

const TAG_STYLE = {
  padding: "3px 5px",
  margin: "3px 3px",
  background: "#5bc0de",
  borderRadius: "3px",
  color: "white",
  display: "inline-block",
} as const;

interface Props {
  actions: JupyterActions;
  cell: ImmutableMap<string, any>;
}

export default function TagsToolbar({ actions, cell }: Props) {
  const [input, setInput] = useState<string>("");

  function renderTag(tag: string) {
    return (
      <span key={tag} style={TAG_STYLE}>
        {tag}
        <Icon
          name="times"
          style={{ marginLeft: "5px", cursor: "pointer" }}
          onClick={() => actions.remove_tag(cell.get("id"), tag)}
        />
      </span>
    );
  }

  function renderTags() {
    const tags = cell.get("tags");
    if (tags == null) {
      return;
    }
    // TODO: skip toJS call and just use immutable functions?
    return (
      <div style={{ flex: 1 }}>{keys(tags.toJS()).sort().map(renderTag)}</div>
    );
  }

  function addTags() {
    for (const tag of split(input)) {
      actions.add_tag(cell.get("id"), tag, false);
    }
    actions._sync();
    setInput("");
  }

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", float: "right" }}>
        {renderTags()}
        <div style={{ display: "flex" }}>
          <Input
            onFocus={actions.blur_lock}
            onBlur={actions.focus_unlock}
            value={input}
            onChange={(e: any) => setInput(e.target.value)}
            size="small"
            onPressEnter={() => {
              addTags();
            }}
          />
          <Button
            size="small"
            disabled={input.length === 0}
            title="Add tag or tags (separate by spaces)"
            onClick={addTags}
          >
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
