/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { Button } from "antd";
import { Icon } from "smc-webapp/r_misc";
import { formatAction } from "../format";
import { SlateEditor } from "../editable-markdown";

export interface Marks {
  [mark: string]: boolean | undefined;
}

interface Props {
  Search: JSX.Element;
  isCurrent?: boolean;
  marks: Marks;
  editor: SlateEditor;
}

const HEIGHT = "25px";

export const EditBar: React.FC<Props> = ({
  isCurrent,
  Search,
  marks,
  editor,
}) => {
  function renderContent() {
    return (
      <>
        <MarksBar marks={marks} editor={editor} />
        <div>{Search}</div>
      </>
    );
  }

  return (
    <div
      style={{
        borderBottom: isCurrent ? "1px solid lightgray" : "1px solid white",
        height: HEIGHT,
        display: "flex",
        flexDirection: "row",
      }}
    >
      {isCurrent && renderContent()}
    </div>
  );
};

interface MarkButtonProps {
  mark: string;
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

const MARKS = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "code",
  /*"sup",
      "sub",*/
];

const MarksBar: React.FC<MarksBarProps> = ({ marks, editor }) => {
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
  return <div style={{ flex: 1, whiteSpace: "nowrap" }}>{v}</div>;
};
