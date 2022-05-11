/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React, { CSSProperties } from "react";
import { Button } from "antd";
import { Icon, IconName } from "@cocalc/frontend/components";
import { formatAction } from "../format";
import { SlateEditor } from "../editable-markdown";
import { Marks } from "./marks";
import ColorButton from "./color-button";
import FontFamily from "./font-family";
import FontSize from "./font-size";
import Heading from "./heading";
import Insert from "./insert";

export const BUTTON_STYLE = {
  color: "#666",
  height: "24px",
  borderLeft: "1px solid lightgray",
  borderRight: "1px solid lightgray",
  borderTop: "none",
  borderBottom: "none",
  padding: "0 10px",
} as CSSProperties;

interface MarkButtonProps {
  mark: IconName;
  active: boolean;
  editor: SlateEditor;
}

const MarkButton: React.FC<MarkButtonProps> = ({ mark, active, editor }) => {
  return (
    <Button
      type="text"
      style={{ ...BUTTON_STYLE, backgroundColor: active ? "#ccc" : undefined }}
      onClick={() => formatAction(editor, mark, [])}
    >
      <Icon name={mark} />
    </Button>
  );
};

interface MarksBarProps {
  marks: Marks;
  editor: SlateEditor;
}

const MARKS: IconName[] = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "code",
  /*"sup",
      "sub",*/
];

export const MarksBar: React.FC<MarksBarProps> = ({ marks, editor }) => {
  const v: JSX.Element[] = [];
  v.push(<Insert key="insert" editor={editor} />);
  for (const mark of MARKS) {
    v.push(
      <MarkButton
        key={mark}
        mark={mark}
        active={marks[mark] ?? false}
        editor={editor}
      />
    );
  }
  v.push(<FontFamily key={"font"} editor={editor} />);
  v.push(<FontSize key={"size"} editor={editor} />);
  v.push(<Heading key="heading" editor={editor} />);
  v.push(<ColorButton key={"color"} editor={editor} />);
  return (
    <div style={{ paddingRight: "10px", flex: 1, whiteSpace: "nowrap" }}>
      {v}
    </div>
  );
};
