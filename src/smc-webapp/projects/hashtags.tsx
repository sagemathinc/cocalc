/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Tag } from "antd";
import { Map } from "immutable";
import { trunc } from "smc-util/misc";

import { React } from "../app-framework";
import { analytics_event } from "../tracker";
const { CheckableTag } = Tag;

const STYLE: React.CSSProperties = {
  maxHeight: "18ex",
  overflowY: "auto",
  overflowX: "hidden",
  border: "1px solid lightgrey",
  padding: "5px",
  background: "#fafafa",
  borderRadius: "5px",
};

interface Props {
  hashtags: string[];
  toggle_hashtag: (tag: string) => void;
  selected_hashtags?: Map<string, boolean>;
}

export const Hashtags: React.FC<Props> = ({
  hashtags,
  toggle_hashtag,
  selected_hashtags,
}) => {
  const HashTag: React.FC<{ tag: string }> = ({ tag }) => {
    let checked: boolean = !!selected_hashtags?.get(tag);
    return (
      <CheckableTag
        checked={checked}
        onChange={() => {
          toggle_hashtag(tag);
          analytics_event("projects_page", "clicked_hashtag", tag);
        }}
      >
        {trunc(tag, 40)}
      </CheckableTag>
    );
  };

  return (
    <div style={STYLE}>
      {hashtags.map((tag) => (
        <HashTag tag={tag} key={tag} />
      ))}
    </div>
  );
};
