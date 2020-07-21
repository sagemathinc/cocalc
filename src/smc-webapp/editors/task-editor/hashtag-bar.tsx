/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Hashtag bar for selecting which tasks are shown by tags
*/

import { cmp, trunc } from "smc-util/misc";
import { Tag } from "antd";
const { CheckableTag } = Tag;
import { CSS, React } from "../../app-framework";
import {
  HashtagsOfVisibleTasks,
  HashtagState,
  SelectedHashtags,
} from "./types";
import { TaskActions } from "./actions";
import { STYLE as GENERIC_STYLE } from "../../projects/hashtags";

const STYLE: CSS = { ...GENERIC_STYLE, ...{ margin: "5px" } };

interface HashtagProps {
  actions: TaskActions;
  tag: string;
  state?: HashtagState;
}

const Hashtag: React.FC<HashtagProps> = React.memo(
  ({ actions, tag, state }) => {
    function click() {
      switch (state) {
        case 1:
          // this would switch to negation state; but that's annoying and confusing
          // in that it is a change from current ui, so let's not do this for now.
          // User *can* now type -#foo in search box at least.
          //actions.set_hashtag_state(tag, -1)
          actions.set_hashtag_state(tag);
          break;
        case -1:
          actions.set_hashtag_state(tag);
          break;
        default:
          actions.set_hashtag_state(tag, 1);
          break;
      }
    }
    return (
      <CheckableTag
        style={{ fontSize: "9pt" }}
        checked={state == 1 || state == -1}
        onChange={click}
      >
        #{trunc(tag, 40)}
      </CheckableTag>
    );
  }
);

interface Props {
  actions: TaskActions;
  hashtags?: HashtagsOfVisibleTasks;
  selected_hashtags?: SelectedHashtags;
}

export const HashtagBar: React.FC<Props> = React.memo(
  ({ actions, hashtags, selected_hashtags }) => {
    function render_hashtag(tag: string): JSX.Element {
      return (
        <Hashtag
          key={tag}
          actions={actions}
          tag={tag}
          state={selected_hashtags?.get(tag)}
        />
      );
    }

    function render_hashtags(): JSX.Element[] {
      const v: [string, JSX.Element][] = [];
      hashtags?.forEach((tag) => {
        v.push([tag, render_hashtag(tag)]);
      });
      v.sort((a, b) => cmp(a[0], b[0]));
      return v.map((x) => x[1]);
    }

    if (hashtags == null) return <></>;

    return <div style={STYLE}>{render_hashtags()}</div>;
  }
);
