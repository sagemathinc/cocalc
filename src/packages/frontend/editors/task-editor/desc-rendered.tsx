/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Rendered view of the description of a single task
*/

import { React } from "../../app-framework";
import MostlyStaticMarkdown from "@cocalc/frontend/editors/slate/mostly-static-markdown";
import { header_part } from "./desc-rendering";
import { TaskActions } from "./actions";

interface Props {
  actions?: TaskActions;
  task_id: string;
  desc: string;
  read_only: boolean;
  selectedHashtags?: Set<string>;
  searchWords?: string[];
  is_current?: boolean;
  hideBody?: boolean;
}

export const DescriptionRendered: React.FC<Props> = React.memo(
  ({
    actions,
    task_id,
    desc,
    read_only,
    selectedHashtags,
    searchWords,
    is_current,
    hideBody,
  }) => {
    function render_content() {
      let value = desc;
      if (!value.trim()) {
        return <span style={{ color: "#666" }}>Enter a description...</span>;
      }
      let show_more_link: boolean;
      if (hideBody) {
        let header = header_part(value);
        show_more_link =
          !!is_current && actions != null && header.trim() != value.trim();
        value = header;
      } else {
        show_more_link = false;
      }
      return (
        <>
          <MostlyStaticMarkdown
            value={value}
            searchWords={searchWords}
            onChange={
              actions != null
                ? (value) => {
                    actions.set_desc(task_id, value, true);
                  }
                : undefined
            }
            selectedHashtags={selectedHashtags}
            toggleHashtag={
              selectedHashtags != null && actions != null
                ? (tag) =>
                    actions.set_hashtag_state(
                      tag,
                      selectedHashtags.has(tag) ? undefined : 1
                    )
                : undefined
            }
          />
          {show_more_link && (
            <a onClick={() => actions?.toggleHideBody(task_id)}>Show more...</a>
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
