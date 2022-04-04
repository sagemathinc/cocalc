/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { Button } from "antd";
import { Icon, IconName } from "@cocalc/frontend/components";
import { formatAction } from "../format";
import { SlateEditor } from "../editable-markdown";
import { Marks } from "./marks";

interface MarkButtonProps {
  mark: IconName;
  active: boolean;
  editor: SlateEditor;
}

const MarkButton: React.FC<MarkButtonProps> = ({ mark, active, editor }) => {
  return (
    <Button
      type="text"
      style={{
        color: "#666",
        backgroundColor: active ? "#ccc" : undefined,
        height: "26px",
        borderLeft: "1px solid lightgray",
        borderRight: "1px solid lightgray",
        padding: "0 10px",
      }}
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
  return (
    <div style={{ paddingRight: "10px", flex: 1, whiteSpace: "nowrap" }}>
      {v}
    </div>
  );
};
