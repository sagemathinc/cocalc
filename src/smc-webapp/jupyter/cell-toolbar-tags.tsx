/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The tag editing toolbar functionality for cells.
*/

import { Button, FormControl } from "react-bootstrap";
import { React, useState } from "../app-framework";
import { Map as ImmutableMap } from "immutable";
import { Icon } from "../r_misc";
const misc = require("@cocalc/util/misc");
import { JupyterActions } from "./browser-actions";

const TAG_STYLE: React.CSSProperties = {
  padding: "3px 5px",
  margin: "3px 3px",
  background: "#5bc0de",
  borderRadius: "3px",
  color: "white",
  display: "inline-block",
};

interface TagsToolbarProps {
  actions: JupyterActions;
  cell: ImmutableMap<string, any>;
}

export const TagsToolbar: React.FC<TagsToolbarProps> = React.memo(
  (props: TagsToolbarProps) => {
    const { actions, cell } = props;
    const [input, set_input] = useState<string>("");

    function remove_tag(tag: string): void {
      actions.remove_tag(cell.get("id"), tag);
    }

    function render_tag(tag: string) {
      return (
        <span key={tag} style={TAG_STYLE}>
          {tag}
          <Icon
            name="times"
            style={{ marginLeft: "5px", cursor: "pointer" }}
            onClick={() => remove_tag(tag)}
          />
        </span>
      );
    }

    function render_tags() {
      const tags = cell.get("tags");
      if (tags == null) {
        return;
      }
      // TODO: skip toJS call and just use immutable functions?
      return (
        <div style={{ flex: 1 }}>
          {misc
            .keys(tags.toJS())
            .sort()
            .map((tag) => render_tag(tag))}
        </div>
      );
    }

    function render_tag_input() {
      return (
        <FormControl
          onFocus={actions.blur_lock}
          onBlur={actions.focus_unlock}
          type="text"
          value={input}
          onChange={(e: any) => set_input(e.target.value)}
          style={{ height: "34px" }}
          bsSize={"small"}
          onKeyDown={(e) => {
            if (e.which === 13) {
              add_tags();
              return;
            }
          }}
        />
      );
    }

    function add_tags() {
      for (const tag of misc.split(input)) {
        actions.add_tag(cell.get("id"), tag, false);
      }
      actions._sync();
      set_input("");
    }

    function render_add_button() {
      return (
        <Button
          bsSize="small"
          disabled={input.length === 0}
          title="Add tag or tags (separate by spaces)"
          onClick={add_tags}
          style={{ height: "34px" }}
        >
          Add
        </Button>
      );
    }

    function render_input() {
      return (
        <div style={{ display: "flex" }}>
          {render_tag_input()}
          {render_add_button()}
        </div>
      );
    }

    return (
      <div style={{ width: "100%" }}>
        <div style={{ display: "flex", float: "right" }}>
          {render_tags()}
          {render_input()}
        </div>
      </div>
    );
  }
);
