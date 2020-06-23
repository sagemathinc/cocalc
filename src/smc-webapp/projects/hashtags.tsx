/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Tag } from "antd";
import { Set } from "immutable";
import { trunc } from "smc-util/misc";

import { React } from "../app-framework";
const { CheckableTag } = Tag;

const STYLE: React.CSSProperties = {
  maxHeight: "18ex",
  overflowY: "auto",
  overflowX: "hidden",
  border: "1px solid lightgrey",
  padding: "5px",
  background: "#fafafa",
  borderRadius: "5px",
  marginBottom: "15px",
};

interface Props {
  hashtags: string[];
  toggle_hashtag: (tag: string) => void;
  selected_hashtags?: Set<string>;
}

export const Hashtags: React.FC<Props> = ({
  hashtags,
  toggle_hashtag,
  selected_hashtags,
}) => {
  const HashTag: React.FC<{ tag: string }> = ({ tag }) => {
    let checked: boolean = !!selected_hashtags?.has(tag);
    return (
      <CheckableTag
        checked={checked}
        onChange={() => {
          toggle_hashtag(tag);
        }}
      >
        {trunc(tag, 40)}
      </CheckableTag>
    );
  };

  if (hashtags.length == 0) {
    return <></>;
  }

  return (
    <div style={STYLE}>
      {hashtags.map((tag) => (
        <HashTag tag={tag} key={tag} />
      ))}
    </div>
  );
};
