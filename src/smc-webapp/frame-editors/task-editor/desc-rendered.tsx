/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Rendered view of the description of a single task
*/

import { React } from "../../app-framework";
import { Markdown } from "../../r_misc";
import { Map, Set } from "immutable";
import {
  process_hashtags,
  process_checkboxes,
  header_part,
} from "./desc-rendering";
import { path_split } from "smc-util/misc";
import { apply_without_math } from "smc-util/mathjax-utils-2";
import { TaskActions } from "./types";

interface Props {
  actions: TaskActions;
  task_id: string;
  desc: string;
  path: string;
  project_id: string;
  full_desc: boolean;
  read_only: boolean;
  selected_hashtags: Map<string, any>;
  search_terms: Set<string>;
}

export const DescriptionRendered: React.FC<Props> = React.memo(
  ({
    actions,
    task_id,
    desc,
    path,
    project_id,
    full_desc,
    read_only,
    selected_hashtags,
    search_terms,
  }) => {
    function render_content() {
      let value = desc;
      if (!(value != null ? value.trim() : undefined)) {
        return <span style={{ color: "#666" }}>Enter a description...</span>;
      }
      if (!full_desc) {
        value = header_part(value);
      }
      const v = [process_checkboxes];
      if (actions != null) {
        v.push((x) => process_hashtags(x, selected_hashtags));
      }
      value = apply_without_math(value, v);

      return (
        <Markdown
          value={value}
          project_id={project_id}
          file_path={path_split(path).head}
          highlight={search_terms}
        />
      );
    }

    function on_click(e) {
      const data = e.target != null ? e.target.dataset : undefined;
      if (data == null) {
        return;
      }
      if (data.checkbox != null) {
        e.stopPropagation();
        actions.toggle_desc_checkbox(
          task_id,
          parseInt(data.index),
          data.checkbox === "true"
        );
      } else if (data.hashtag != null) {
        let new_state;
        e.stopPropagation();
        const state = { undefined: undefined, "1": 1, "-1": -1 }[data.state]; // do not use eval -- safer
        if (state === 1 || state === -1) {
          // for now negation doesn't go through clicking
          new_state = undefined;
        } else {
          new_state = 1;
        }
        actions.set_hashtag_state(data.hashtag, new_state);
      }
    }

    return (
      <div
        style={{ paddingTop: "5px" }}
        onClick={!read_only && actions != null ? on_click : undefined}
      >
        {render_content()}
      </div>
    );
  }
);
