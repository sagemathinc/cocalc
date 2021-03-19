/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { Button } from "antd";
import { Icon } from "smc-webapp/r_misc";
import { formatAction } from "./format";
import { SlateEditor } from "./editable-markdown";

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
  // console.log("EditBar", JSON.stringify(marks));
  function renderButtons() {
    const v: JSX.Element[] = [];
    for (const mark of [
      "bold",
      "italic",
      "underline",
      "strikethrough",
      "code",
      /*"sup",
      "sub",*/
    ]) {
      v.push(
        <MarkButton
          key={mark}
          mark={mark}
          active={marks[mark] ?? false}
          editor={editor}
        />
      );
    }
    return <div>{v}</div>;
  }

  function renderSearch() {
    // put first since float right.
    return <div style={{ float: "right" }}>{Search}</div>;
  }

  function renderBody() {
    return (
      <>
        {renderSearch()}
        {renderButtons()}
      </>
    );
  }

  return (
    <div style={{ borderBottom: "1px solid lightgray", height: HEIGHT }}>
      {isCurrent && renderBody()}
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
        paddingTop: 0,
      }}
      onClick={() => formatAction(editor, mark, [])}
    >
      <Icon name={mark} />
    </Button>
  );
};
