/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Rendered view of the description of a single task
*/

import { React } from "../../app-framework";
import { Markdown } from "../../r_misc";
import { Set } from "immutable";
import {
  process_hashtags,
  process_checkboxes,
  header_part,
} from "./desc-rendering";
import { path_split } from "smc-util/misc";
import { apply_without_math } from "smc-util/mathjax-utils-2";
import { TaskActions } from "./actions";
import { SelectedHashtags } from "./types";

interface Props {
  actions?: TaskActions;
  task_id: string;
  desc: string;
  path?: string;
  project_id?: string;
  full_desc: boolean;
  read_only: boolean;
  selected_hashtags?: SelectedHashtags;
  search_terms?: Set<string>;
  is_current?: boolean;
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
    is_current,
  }) => {
    function render_content() {
      let value = desc;
      if (!value.trim()) {
        return <span style={{ color: "#666" }}>Enter a description...</span>;
      }
      let show_more_link: boolean;
      if (!full_desc) {
        let header = header_part(value);
        show_more_link =
          !!is_current && actions != null && header.trim() != value.trim();
        value = header;
      } else {
        show_more_link = false;
      }
      const v: Function[] = [process_checkboxes];
      v.push((x) => process_hashtags(x, selected_hashtags));
      value = apply_without_math(value, v);

      // we use the no_hashtags option below so the generic Markdown
      // renderer doesn't do any processing of hashtags.
      return (
        <>
          <Markdown
            value={value}
            project_id={project_id}
            file_path={path ? path_split(path).head : undefined}
            highlight={search_terms}
            no_hashtags={true}
          />
          {show_more_link && (
            <a onClick={() => actions?.toggle_full_desc(task_id)}>
              Show more...
            </a>
          )}
        </>
      );
    }

    function on_click(e) {
      const data = e.target != null ? e.target.dataset : undefined;
      if (data == null) {
        return;
      }
      if (data.checkbox != null) {
        e.stopPropagation();
        actions?.toggle_desc_checkbox(
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
        actions?.set_hashtag_state(data.hashtag, new_state);
      }
    }

    return (
      <div
        style={{ paddingTop: "5px" }}
        onClick={!read_only && actions != null ? on_click : undefined}
        className="cocalc-task-description"
      >
        {render_content()}
      </div>
    );
  }
);
