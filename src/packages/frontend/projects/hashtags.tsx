/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Tag } from "antd";
import { Set } from "immutable";

import { React } from "@cocalc/frontend/app-framework";
import { trunc } from "@cocalc/util/misc";

const { CheckableTag } = Tag;

export const STYLE: React.CSSProperties = {
  // this is used externally for a consistent hashtag look; change carefully!
  maxHeight: "18ex",
  overflowY: "auto",
  overflowX: "hidden",
  border: "1px solid lightgrey",
  padding: "5px",
  background: "#fafafa",
  borderRadius: "5px",
  marginBottom: "15px",
} as const;

interface Props {
  hashtags: string[];
  toggle_hashtag: (tag: string) => void;
  selected_hashtags?: Set<string>;
}

export function Hashtags({
  hashtags,
  toggle_hashtag,
  selected_hashtags,
}: Props) {
  if (hashtags.length == 0) {
    return <></>;
  }

  return (
    <div style={STYLE}>
      {hashtags.map((tag) => {
        const checked: boolean = !!selected_hashtags?.has(tag);
        return (
          <HashTag
            tag={tag}
            key={tag}
            checked={checked}
            toggle_hashtag={toggle_hashtag}
          />
        );
      })}
    </div>
  );
}

interface HashTagProps {
  tag: string;
  checked: boolean;
  toggle_hashtag: (tag: string) => void;
}

function HashTag({ tag, toggle_hashtag, checked }: HashTagProps) {
  return (
    <CheckableTag checked={checked} onChange={() => toggle_hashtag(tag)}>
      {trunc(tag, 40)}
    </CheckableTag>
  );
}
