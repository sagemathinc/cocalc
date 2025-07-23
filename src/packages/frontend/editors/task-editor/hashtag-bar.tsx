/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Hashtag bar for selecting which tasks are shown by tags
*/

import { CSSProperties } from "react";
import { cmp, trunc } from "@cocalc/util/misc";
import { Tag } from "antd";
const { CheckableTag } = Tag;
import {
  HashtagsOfVisibleTasks,
  HashtagState,
  SelectedHashtags,
} from "./types";
import { STYLE as GENERIC_STYLE } from "../../projects/hashtags";

const STYLE: CSSProperties = {
  ...GENERIC_STYLE,
  margin: "5px",
  maxHeight: "40px",
  overflowY: "auto",
};

interface Actions {
  set_hashtag_state: (tag: string, state?: HashtagState) => void;
}

interface HashtagProps {
  actions: Actions;
  tag: string;
  state?: HashtagState;
}

function Hashtag({ actions, tag, state }: HashtagProps) {
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

interface Props {
  actions: Actions;
  hashtags?: HashtagsOfVisibleTasks;
  selected_hashtags?: SelectedHashtags;
  style?: CSSProperties;
}

export function HashtagBar({
  actions,
  hashtags,
  selected_hashtags,
  style,
}: Props) {
  function render_hashtag(tag: string): React.JSX.Element {
    return (
      <Hashtag
        key={tag}
        actions={actions}
        tag={tag}
        state={selected_hashtags?.get(tag)}
      />
    );
  }

  function render_hashtags(): React.JSX.Element[] {
    const v: [string, React.JSX.Element][] = [];
    hashtags?.forEach((tag) => {
      v.push([tag, render_hashtag(tag)]);
    });
    v.sort((a, b) => cmp(a[0], b[0]));
    return v.map((x) => x[1]);
  }

  if (hashtags == null || hashtags.size == 0) return <></>;

  return <div style={{ ...STYLE, ...style }}>{render_hashtags()}</div>;
}
